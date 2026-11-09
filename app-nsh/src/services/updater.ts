import { join } from 'path'
import { exit } from 'process'
import { Fs, Process, Shell, Sys } from 'teabranch/native'
import { t } from '../shared/i18n'
import type { UpdateRelease, UpdateState } from '../shared/types'
import { changelogSince, compareVersions, parseCask } from '../shared/updates'
import { emit } from '../core/events'
import { httpFetch } from '../core/http'
import { TeaBranchError, errorMessage, log } from '../core/log'
import { configDirectory } from '../core/settingsStore'
import { run } from '../core/shell'

/**
 * Updates from inside the app: the cask in the repository names the latest release and its
 * checksum, the DMG is fetched and unpacked next to the app's data, and "restart to update" swaps
 * the bundle and opens it again. A download made here carries no quarantine flag, so Gatekeeper
 * has nothing to say about the ad hoc signature — the same reason `install-local.sh` needs no
 * "open anyway".
 *
 * Only a packaged TeaBranch checks by itself: the dev host runs under nsh's own bundle, which an
 * update could not replace.
 */

const REPO_RAW = 'https://raw.githubusercontent.com/caoxing9/TeaBranch/main'
const BUNDLE_ID = 'com.teabranch.dev'
const FIRST_CHECK_MS = 15_000
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000
const dir = join(configDirectory, 'updates')

let state: UpdateState = { current: 'dev', status: 'idle' }
let beforeRestart: (() => Promise<void>) | undefined
let timer: ReturnType<typeof setInterval> | undefined

function set(patch: Partial<UpdateState>): UpdateState {
  state = { ...state, ...patch }
  emit('updateState', state)
  return state
}

async function plist(bundle: string, key: string): Promise<string | undefined> {
  const result = await run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, join(bundle, 'Contents/Info.plist')])
  return result.ok ? result.out : undefined
}

/** The running bundle and its version — or the dev host, with the version nsh.json would stamp. */
async function locate(): Promise<Pick<UpdateState, 'current' | 'bundle'>> {
  const bundle = /^(.*\.app)\/Contents\/MacOS\/[^/]+$/.exec(Shell.exe())?.[1]
  if (bundle && (await plist(bundle, 'CFBundleIdentifier')) === BUNDLE_ID) {
    return { current: (await plist(bundle, 'CFBundleShortVersionString')) ?? 'dev', bundle }
  }
  try {
    const json = JSON.parse(Fs.readFile(join(Fs.realpath('.'), 'nsh.json'))) as { version?: string }
    if (json.version) return { current: json.version }
  } catch {
    // Not started from the app's directory.
  }
  return { current: 'dev' }
}

const stagedPath = (version: string): string => join(dir, version, 'TeaBranch.app')

async function text(url: string): Promise<string> {
  const response = await httpFetch(url, { headers: { 'cache-control': 'no-cache' } })
  if (!response.ok) throw new TeaBranchError(t('读不到发布信息（HTTP {status}）', { status: response.status }))
  return response.text()
}

/**
 * The system's proxy, for curl: nsh's fetch follows it by itself, but a 25 MB file is past what
 * fetch may write (8 MiB), so the DMG comes down through curl — which only knows the proxies its
 * environment names, and a Dock-launched app has none of those.
 */
async function systemProxy(): Promise<string | undefined> {
  const result = await run('scutil', ['--proxy'])
  if (!result.ok) return undefined
  const value = (key: string): string | undefined => new RegExp(`^\\s*${key} : (.+)$`, 'm').exec(result.stdout)?.[1]?.trim()
  if (value('HTTPSEnable') === '1' && value('HTTPSProxy')) return `http://${value('HTTPSProxy')}:${value('HTTPSPort') ?? 80}`
  if (value('HTTPEnable') === '1' && value('HTTPProxy')) return `http://${value('HTTPProxy')}:${value('HTTPPort') ?? 80}`
  if (value('SOCKSEnable') === '1' && value('SOCKSProxy')) return `socks5h://${value('SOCKSProxy')}:${value('SOCKSPort') ?? 1080}`
  return undefined
}

/** What an earlier update left behind: the app it replaced, a DMG, a mount point. */
async function sweep(): Promise<void> {
  if (!Fs.exists(dir)) return
  const mount = join(dir, 'mnt')
  if (Fs.exists(mount)) {
    await run('hdiutil', ['detach', mount, '-force'])
    Fs.rm(mount, true, true)
  }
  for (const entry of Fs.readdir(dir)) {
    if (entry.name.startsWith('previous-') || entry.name.endsWith('.dmg')) Fs.rm(join(dir, entry.name), true, true)
  }
}

/** The DMG to `path`, with the progress reported as its size grows against the server's Content-Length. */
async function fetchDMG(url: string, path: string): Promise<void> {
  Fs.rm(path, false, true)
  const total = await httpFetch(url, { method: 'HEAD' })
    .then((response) => Number(response.headers.get('content-length')) || 0)
    .catch(() => 0)
  const poll = setInterval(() => {
    try {
      if (total && Fs.exists(path)) set({ progress: Math.min(1, Fs.stat(path).size / total) })
    } catch {
      // Not there yet.
    }
  }, 500)
  try {
    const proxy = await systemProxy()
    const args = ['-fsSL', '--retry', '2', '--connect-timeout', '20', '-o', path, url]
    if (proxy) args.push('--proxy', proxy)
    const result = await run('curl', args, { timeoutMs: 20 * 60_000 })
    if (!result.ok) throw new TeaBranchError(t('下载失败：{error}', { error: result.stderr.trim() || `curl exit ${result.status}` }))
  } finally {
    clearInterval(poll)
  }
}

/** The DMG, checked against the cask's sha256, then its app copied out to `stagedPath`. */
async function download(latest: UpdateRelease): Promise<void> {
  Fs.mkdir(dir, true)
  const dmg = join(dir, `TeaBranch-${latest.version}.dmg`)
  await fetchDMG(latest.url, dmg)
  const sum = await run('shasum', ['-a', '256', dmg])
  if (sum.out.split(/\s+/)[0] !== latest.sha256) {
    Fs.rm(dmg, false, true)
    throw new TeaBranchError(t('下载的文件校验不符'))
  }

  const mount = join(dir, 'mnt')
  if (Fs.exists(mount)) await run('hdiutil', ['detach', mount, '-force'])
  Fs.rm(mount, true, true)
  Fs.mkdir(mount, true)
  const attached = await run('hdiutil', ['attach', dmg, '-nobrowse', '-readonly', '-noautoopen', '-noverify', '-mountpoint', mount], {
    timeoutMs: 120_000,
  })
  if (!attached.ok) throw new TeaBranchError(t('打不开安装包：{error}', { error: attached.stderr.trim() }))
  const staged = stagedPath(latest.version)
  try {
    Fs.rm(join(dir, latest.version), true, true)
    Fs.mkdir(join(dir, latest.version), true)
    const copied = await run('ditto', [join(mount, 'TeaBranch.app'), staged], { timeoutMs: 120_000 })
    if (!copied.ok) throw new TeaBranchError(t('解包失败：{error}', { error: copied.stderr.trim() }))
  } finally {
    const detached = await run('hdiutil', ['detach', mount])
    if (!detached.ok) await run('hdiutil', ['detach', mount, '-force'])
    Fs.rm(mount, true, true)
    Fs.rm(dmg, false, true)
  }
  if ((await plist(staged, 'CFBundleShortVersionString')) !== latest.version)
    throw new TeaBranchError(t('安装包里不是 v{version}', { version: latest.version }))
}

/**
 * The running app out of the way (to `previous`), the unpacked one in its place. A rename, which is
 * atomic on one volume; a copy when the volumes differ — and the old app back if even that fails.
 */
export async function swapBundle(bundle: string, staged: string, previous: string): Promise<void> {
  Fs.rm(previous, true, true)
  Fs.rename(bundle, previous)
  try {
    Fs.rename(staged, bundle)
  } catch (error) {
    const copied = await run('ditto', [staged, bundle], { timeoutMs: 120_000 })
    if (!copied.ok) {
      Fs.rm(bundle, true, true)
      Fs.rename(previous, bundle)
      throw new TeaBranchError(t('替换 {path} 失败：{error}', { path: bundle, error: copied.stderr.trim() || errorMessage(error) }))
    }
  }
  await run('xattr', ['-dr', 'com.apple.quarantine', bundle])
}

export const updater = {
  state: (): UpdateState => state,

  /** What runs before the app quits for the new version (the services' shutdown). */
  setBeforeRestart(fn: () => Promise<void>): void {
    beforeRestart = fn
  },

  /** Once, at boot: find out what runs, clear what an earlier update left, and start the checks of a packaged build. */
  async start(): Promise<void> {
    set(await locate())
    await sweep().catch((error) => log.warn(`updates: sweep failed: ${errorMessage(error)}`))
    if (!state.bundle) return
    setTimeout(() => void updater.check(), FIRST_CHECK_MS)
    timer ??= setInterval(() => void updater.check(), CHECK_EVERY_MS)
  },

  /** Compare with the latest release and, when it is newer, have it downloaded and unpacked. */
  async check(): Promise<UpdateState> {
    if (state.status === 'checking' || state.status === 'downloading' || state.status === 'installing') return state
    set({ status: 'checking', error: undefined })
    try {
      const cask = parseCask(await text(`${REPO_RAW}/Casks/teabranch.rb`))
      if (compareVersions(cask.version, state.current) <= 0) {
        return set({ status: 'none', latest: undefined, staged: undefined, checkedAt: Date.now() })
      }
      const notes = changelogSince(await text(`${REPO_RAW}/CHANGELOG.md`).catch(() => ''), state.current, cask.version)
      const latest: UpdateRelease = { version: cask.version, url: cask.url, sha256: cask.sha256, notes }
      set({ latest, checkedAt: Date.now() })
      const staged = stagedPath(latest.version)
      // Unpacked already (an earlier check, or a launch before "restart" was pressed).
      if (Fs.exists(staged) && (await plist(staged, 'CFBundleShortVersionString')) === latest.version) return set({ status: 'ready', staged })
      set({ status: 'downloading', staged: undefined, progress: undefined })
      await download(latest)
      log.info(`updates: ${latest.version} is unpacked at ${staged}`)
      return set({ status: 'ready', staged, progress: undefined })
    } catch (error) {
      log.warn(`updates: ${errorMessage(error)}`)
      return set({ status: 'failed', error: errorMessage(error), progress: undefined })
    }
  },

  /** Put the unpacked app in the running one's place, then quit and reopen it. */
  async install(): Promise<void> {
    const { bundle, latest, staged } = state
    if (state.status !== 'ready' || !latest || !staged) throw new TeaBranchError(t('还没有下载好的更新'))
    if (!bundle) throw new TeaBranchError(t('开发版不能自动安装，新版本在 {path}', { path: staged }))
    set({ status: 'installing' })
    try {
      await swapBundle(bundle, staged, join(dir, `previous-${state.current}.app`))
    } catch (error) {
      set({ status: 'failed', error: errorMessage(error) })
      throw error
    }
    // Reopens the app once this process is gone. Its own process group, so quitting leaves it
    // alone; HOME goes along so a copy run with another home (a test's) comes back with it.
    new Process('/bin/sh', ['-c', 'while kill -0 "$1" 2>/dev/null; do sleep 0.2; done; open --env HOME="$HOME" "$2"', 'sh', String(Sys.pid()), bundle]).start()
    log.info(`updates: ${latest.version} is in ${bundle}; restarting`)
    await beforeRestart?.()
    exit(0)
  },
}
