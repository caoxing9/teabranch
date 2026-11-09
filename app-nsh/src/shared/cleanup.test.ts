import { describe, expect, test } from 'nsh/test'
import { cleanupBlockers, judgeCleanup } from './cleanup'

describe('cleanupBlockers', () => {
  test('clears a merged PR with nothing left behind', () => {
    expect(cleanupBlockers({ prState: 'MERGED', unpushed: 0, changed: 0 })).toEqual([])
    expect(cleanupBlockers({ prState: 'CLOSED', unpushed: 0, changed: 0 })).toEqual([])
  })

  test('clears a probe that never got a PR', () => {
    expect(cleanupBlockers({ unpushed: 0, changed: 0 })).toEqual([])
  })

  test('holds what it could not check', () => {
    expect(cleanupBlockers({ unpushed: 0, changed: 0, unknown: ['git status'] })).toHaveLength(1)
  })

  test('holds an open PR, unpushed commits and edited files, each its own reason', () => {
    expect(cleanupBlockers({ prState: 'OPEN', unpushed: 2, changed: 3 })).toHaveLength(3)
    expect(cleanupBlockers({ prState: 'MERGED', unpushed: 1, changed: 0 })).toHaveLength(1)
    expect(cleanupBlockers({ unpushed: 0, changed: 1 })).toHaveLength(1)
  })
})

describe('judgeCleanup', () => {
  const clean = { unpushed: 0, changed: 0 }

  test('a merged PR is finished, whether or not its commits are in the base', () => {
    const squashed = judgeCleanup({ state: { ...clean, prState: 'MERGED' }, merged: false, base: 'develop', prNumber: 12 })
    expect(squashed.done).toBe(true)
    expect(squashed.blockers).toEqual([])
    expect(squashed.summary).toContain('#12')
    expect(judgeCleanup({ state: { ...clean, prState: 'MERGED' }, merged: true, base: 'develop' }).done).toBe(true)
  })

  test('a branch already in the base is finished without a PR', () => {
    const verdict = judgeCleanup({ state: clean, merged: true, base: 'develop' })
    expect(verdict.done).toBe(true)
    expect(verdict.summary).toContain('develop')
  })

  test('an open PR is never finished, even with its commits in the base', () => {
    expect(judgeCleanup({ state: { ...clean, prState: 'OPEN' }, merged: true, base: 'develop', prNumber: 3 }).done).toBe(false)
  })

  test('finished but held: the blockers still stand', () => {
    const verdict = judgeCleanup({ state: { prState: 'MERGED', unpushed: 0, changed: 2 }, merged: false, base: 'develop', agentRunning: true })
    expect(verdict.done).toBe(true)
    expect(verdict.blockers).toHaveLength(2)
  })

  test('a branch in the base is clear even when the PR could not be looked up', () => {
    const verdict = judgeCleanup({ state: { ...clean, unknown: ['PR'] }, merged: true, base: 'develop' })
    expect(verdict.done).toBe(true)
    expect(verdict.blockers).toEqual([])
    expect(judgeCleanup({ state: { ...clean, unknown: ['PR'] }, merged: false, base: 'develop' }).blockers).toHaveLength(1)
  })

  test('no PR and nothing in the base: not finished, and says so', () => {
    expect(judgeCleanup({ state: clean, merged: false, base: 'develop' }).done).toBe(false)
    expect(judgeCleanup({ state: { ...clean, prState: 'CLOSED' }, merged: false, base: 'develop', prNumber: 7 }).done).toBe(false)
    expect(judgeCleanup({ state: { ...clean, unknown: ['PR'] }, merged: false, base: 'develop' }).summary).not.toBe(
      judgeCleanup({ state: clean, merged: false, base: 'develop' }).summary,
    )
  })
})
