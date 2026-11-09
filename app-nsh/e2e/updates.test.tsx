// The update window, reached from the About page: the dev host never checks by itself, so the
// check is asked for; the release is read from the repository, the DMG downloaded and unpacked
// (into this HOME's Application Support), and the window opens on its own with the changes since
// the version nsh.json names. Needs the network; run with `nsh test --target macos
// e2e/updates.test.tsx` for the screenshots.
import { expect, open, test } from 'nsh/test'

const SHOTS = '.nsh/shots'

test('offers the latest release with its changelog, and keeps it in the sidebar after 稍后', async () => {
  const app = await open('../App.tsx', { platform: 'macos', width: 1200, height: 832, network: 'live' })
  await app.waitFor('text:分支', { timeout: 20_000 })
  await app.press('text:分支')
  await app.wait(400)
  await app.press('label:设置')
  await app.waitFor('text:主题', { timeout: 10_000 })
  await app.press('text:关于 >> nth=0')
  await app.waitFor('text:检查更新', { timeout: 10_000 })
  expect(app.texts()).toContain('开发版不会自动检查')
  await app.press('text:检查更新')

  // Downloading ~25 MB; a network without GitHub ends the test here, not in a failure.
  const settled = () => app.shows('text:重启以更新') || app.shows('text:已是最新版本') || app.texts().some((text) => /HTTP|连不上|失败/.test(text))
  await app.waitUntil(settled, { timeout: 150_000 })
  if (!app.shows('text:重启以更新')) return
  await app.wait(600)
  await app.screenshot(`${SHOTS}/e2e-updates-1.png`).catch(() => undefined)
  expect(app.texts().some((text) => /^更新到 v\d+\.\d+\.\d+$/.test(text))).toBe(true)
  expect(app.texts().some((text) => text.startsWith('自 v') && text.endsWith('以来的更新内容'))).toBe(true)
  // The dev host has no bundle to replace: the footer says where the new app is instead.
  expect(app.texts().some((text) => text.startsWith('开发版不能自动安装'))).toBe(true)

  await app.press('text:稍后')
  await app.wait(400)
  expect(app.shows('text:重启以更新')).toBe(false)
  // The About page behind it reports the same, and the sidebar's pill keeps the update at hand.
  expect(app.texts().some((text) => text.endsWith('重启即可更新'))).toBe(true)
  await app.press('label:关闭')
  await app.wait(400)
  await app.screenshot(`${SHOTS}/e2e-updates-2.png`).catch(() => undefined)
  expect(app.texts()).toContain('更新')
  await app.press('text:更新')
  await app.waitFor('text:重启以更新', { timeout: 5_000 })
}, 180_000)
