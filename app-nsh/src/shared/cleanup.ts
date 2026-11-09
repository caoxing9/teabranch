import { t } from './i18n'

/** What stands between a finished issue and deleting its worktree. */
export interface CleanupState {
  /** The branch's PR, when there is one: OPEN, MERGED or CLOSED. */
  prState?: string
  /** Commits on the branch that exist nowhere but this machine. */
  unpushed: number
  /** Files changed and not committed, new ones included; what git ignores doesn't count. */
  changed: number
  /** Checks that couldn't be made. Not knowing is reason enough to keep it. */
  unknown?: string[]
}

/**
 * Why the worktree can't go yet, one reason a line; empty when it can. Never deletes work that exists
 * only here: an open PR is still being reviewed, unpushed commits and edited files would be lost.
 */
export function cleanupBlockers(state: CleanupState): string[] {
  const blockers: string[] = []
  if (state.prState === 'OPEN') blockers.push(t('PR 还开着'))
  if (state.unpushed > 0) blockers.push(t('{n} 个提交还没推送', { n: state.unpushed }))
  if (state.changed > 0) blockers.push(t('{n} 个文件改了还没提交', { n: state.changed }))
  for (const check of state.unknown ?? []) blockers.push(t('没能检查 {check}', { check }))
  return blockers
}

/** A worktree as the cleanup window lists it: whose work it holds, where that work stands, and whether it can go. */
export interface CleanupCandidate {
  branch: string
  worktreePath: string
  /** The issue TeaBranch started this branch for, when it did. */
  recordId?: string
  issueKey?: string
  issueTitle?: string
  prURL?: string
  prNumber?: number
  prState?: string
  /** The work has landed — the PR is merged, or the branch's commits are all in the base — so the branch is finished. */
  done: boolean
  /** What `cleanupBlockers` found, plus a running agent; empty when nothing exists only here. */
  blockers: string[]
  /** One line on where the branch stands: "PR #12 已合并", "已并入 develop", "PR #12 还开着", "没有 PR". */
  summary: string
}

/**
 * Finished or not, and why, from what the survey measured. `merged` is HEAD already being in the
 * base; a squash merge leaves it false, which is what the PR's state is for.
 */
export function judgeCleanup(input: {
  state: CleanupState
  merged: boolean
  base: string
  prNumber?: number
  agentRunning?: boolean
}): Pick<CleanupCandidate, 'done' | 'blockers' | 'summary'> {
  const { prNumber } = input
  // Every commit already in the base: whether the PR could be looked up no longer decides anything.
  const state = input.merged ? { ...input.state, unknown: input.state.unknown?.filter((check) => check !== 'PR') } : input.state
  const blockers = cleanupBlockers(state)
  if (input.agentRunning) blockers.push(t('agent 还在运行'))
  const pr = prNumber !== undefined ? `PR #${prNumber}` : undefined
  if (state.prState === 'MERGED') return { done: true, blockers, summary: t('{pr} 已合并', { pr: pr ?? 'PR' }) }
  if (state.prState === 'OPEN') return { done: false, blockers, summary: t('{pr} 还开着', { pr: pr ?? 'PR' }) }
  if (input.merged) return { done: true, blockers, summary: t('已并入 {base}', { base: input.base }) }
  if (state.prState === 'CLOSED') return { done: false, blockers, summary: t('{pr} 关闭了，没有合并', { pr: pr ?? 'PR' }) }
  return { done: false, blockers, summary: state.unknown?.includes('PR') ? t('没能检查 PR') : t('没有 PR') }
}
