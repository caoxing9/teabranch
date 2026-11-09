// The cleanup window from the branches sidebar: every managed worktree with where its work stands,
// the finished ones pre-checked. Needs `gh` and the network for the PR lookups; run with
// `nsh test --target macos e2e/cleanup.test.tsx` for the screenshot.
import { expect, open, test } from 'nsh/test'

test('lists the worktrees with their state and lets the survey be cancelled', async () => {
  const app = await open('../App.tsx', { platform: 'macos', width: 1200, height: 832, network: 'live' })
  await app.waitFor('text:分支', { timeout: 20_000 })
  await app.press('text:分支')
  await app.wait(400)
  await app.press('label:清理已完成的 worktree…')
  await app.waitFor('text:清理已完成的 worktree', { timeout: 5_000 })
  // Either the list, with its explanation and the button, or the empty state; a failure shows its message.
  const settled = () => app.shows('text:取消') || app.shows('text:没有可清理的 worktree') || app.texts().some((text) => text.startsWith('检查失败'))
  await app.waitUntil(settled, { timeout: 120_000 })
  await app.wait(500)
  await app.screenshot('.nsh/shots/e2e-cleanup-1.png').catch(() => undefined)
  expect(app.texts().some((text) => text.startsWith('检查失败'))).toBe(false)
  if (app.shows('text:取消')) {
    expect(app.texts().some((text) => /^已选 \d+ 个/.test(text))).toBe(true)
    await app.press('text:取消')
  } else {
    await app.press('label:关闭')
  }
  await app.wait(300)
  expect(app.shows('text:清理已完成的 worktree')).toBe(false)
}, 150_000)
