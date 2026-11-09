import { emitSoon } from '../core/events'
import { state } from '../core/appState'
import { logs } from '../core/logStore'
import { errorMessage, log } from '../core/log'
import { git, run } from '../core/shell'
import type { IssueRun } from '../shared/types'
import { type CleanupCandidate, type CleanupState, judgeCleanup } from '../shared/cleanup'
import { t } from '../shared/i18n'
import * as browser from './browser'
import * as gitService from './git'
import * as processManager from './processManager'
import * as worktrees from './worktree'

/** Taking a branch's worktree down: what's left in it, and removing it with everything it ran. */

export interface PullRequest {
  number: number
  url: string
  state: string
  headRefOid?: string
}

const PR_FIELDS = 'number,url,state,headRefOid'

/** The branch's PR: the one the run recorded, else the newest GitHub has for the branch; undefined when there is none. Throws when it couldn't ask. */
export async function findPR(repo: string, branch: string, prURL?: string): Promise<PullRequest | undefined> {
  const result = prURL
    ? await run('gh', ['pr', 'view', prURL, '--json', PR_FIELDS], { cwd: repo, timeoutMs: 30_000 })
    : await run('gh', ['pr', 'list', '--head', branch, '--state', 'all', '--limit', '1', '--json', PR_FIELDS], { cwd: repo, timeoutMs: 30_000 })
  if (!result.ok) throw new Error(result.stderr.trim() || `gh exit ${result.status}`)
  const parsed = JSON.parse(result.out) as PullRequest | PullRequest[]
  return Array.isArray(parsed) ? parsed[0] : parsed
}

/**
 * Where the branch stands against its PR and remote — what `cleanupBlockers` judges. A check that
 * fails is reported as unknown rather than read as "nothing there".
 */
export async function inspect(branch: string, cwd: string, prURL?: string): Promise<CleanupState> {
  const unknown: string[] = []
  let pr: PullRequest | undefined
  if (prURL) {
    try {
      pr = await findPR(cwd, branch, prURL)
    } catch {
      unknown.push('PR')
    }
  }
  return inspectWith(cwd, pr, unknown)
}

/** `inspect` with the PR already looked up (or known to be missing). */
export async function inspectWith(cwd: string, pr: PullRequest | undefined, unknown: string[] = []): Promise<CleanupState> {
  // New files count: an agent's work isn't always `git add`ed yet. What git ignores never shows here.
  const status = await git(['status', '--porcelain', '--untracked-files=normal'], cwd)
  if (!status.ok) unknown.push('git status')
  const changed = status.ok ? status.out.split('\n').filter(Boolean).length : 0
  const prState = pr?.state
  const head = await git(['rev-parse', 'HEAD'], cwd)
  // The PR has exactly this commit: nothing is only here, even if its remote branch was deleted
  // after the merge.
  if (head.ok && pr?.headRefOid && head.out === pr.headRefOid) return { prState, unpushed: 0, changed, unknown }
  const upstream = await git(['rev-list', '--count', '@{u}..HEAD'], cwd)
  const local = upstream.ok ? upstream : await git(['rev-list', '--count', `origin/${worktrees.baseBranch}..HEAD`], cwd)
  if (!local.ok) unknown.push(t('未推送的提交'))
  return { prState, unpushed: local.ok ? Number(local.out) || 0 : 0, changed, unknown }
}

/** `fn` over `items`, at most `limit` at a time, results in order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/**
 * Every managed worktree but the checkout's own, with where its work stands: the cleanup window's
 * list. `linked` names the issue run a branch belongs to; `agentRunning` whether that issue's agent
 * is at work. The base is fetched first, so "already in the base" is judged against today's.
 */
export async function survey(
  repo: string,
  linked: (branch: string) => IssueRun | undefined,
  agentRunning: (recordId: string) => boolean,
): Promise<CleanupCandidate[]> {
  await git(['fetch', 'origin', worktrees.baseBranch], repo)
  const list = (await gitService.branches(repo, state.environmentsByBranch())).filter((branch) => branch.managed && !branch.isCurrent && branch.worktreePath)
  return mapLimit(list, 4, async (branch) => {
    const cwd = branch.worktreePath as string
    const run = linked(branch.name)
    const unknown: string[] = []
    let pr: PullRequest | undefined
    try {
      pr = await findPR(repo, branch.name, run?.prURL)
    } catch (error) {
      log.warn(`cleanup survey: PR of ${branch.name}: ${errorMessage(error)}`)
      unknown.push('PR')
    }
    const measured = await inspectWith(cwd, pr, unknown)
    // Exit 0 is "ancestor", 1 is "not"; anything else is an error, read as "not".
    const merged = (await git(['merge-base', '--is-ancestor', 'HEAD', `origin/${worktrees.baseBranch}`], cwd)).ok
    const verdict = judgeCleanup({
      state: measured,
      merged,
      base: worktrees.baseBranch,
      prNumber: pr?.number,
      agentRunning: run ? agentRunning(run.recordId) : false,
    })
    return {
      branch: branch.name,
      worktreePath: cwd,
      recordId: run?.recordId,
      issueKey: run?.issueKey,
      issueTitle: run?.title,
      prURL: pr?.url ?? run?.prURL,
      prNumber: pr?.number,
      prState: pr?.state,
      ...verdict,
    }
  })
}

/**
 * Stop the branch's servers, close its browser, remove its worktree — and with `deleteBranch`, the
 * local branch too. The caller has made sure nothing is lost by it.
 */
export async function removeWorktree(branch: string, repo: string, options: { deleteBranch?: boolean } = {}): Promise<void> {
  // Held across the whole delete, so `git worktree remove --force` never races a Start that is
  // still writing into the directory.
  await processManager.withBranchLock(branch, async (held) => {
    await processManager.stop(branch, held)
    await worktrees.remove(branch, repo)
    state.removeEnvironment(branch)
    logs.remove(branch)
    if (options.deleteBranch) await git(['branch', '-D', branch], repo)
  })
  browser.close(branch)
  emitSoon('branchesChanged')
}
