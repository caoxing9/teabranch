import { Text, View, signal } from 'nsh'
import { Checkbox } from 'nsh/base'
import type { CleanupCandidate } from '../../../shared/cleanup'
import { t } from '../../../shared/i18n'
import { Icon } from '../../components/Icon'
import { Button, Dialog, EmptyState, Spinner } from '../../components/kit'
import { api, messageOf } from '../../lib/api'
import { cn } from '../../lib/utils'
import { app } from '../../store/app'

type Outcome = { state: 'running' | 'done' } | { state: 'failed'; error: string }

/**
 * Finished branches out of the way in one go. Every managed worktree is listed with where its work
 * stands — PR merged, commits already in the base, or neither — and what deleting it would lose;
 * the finished ones with nothing to lose come pre-checked. Checking a held one is deliberate: its
 * reasons are on the row.
 */
export function CleanupDialog() {
  const close = () => app.set({ showCleanup: false })
  const candidates = signal<CleanupCandidate[] | null>(null)
  const failure = signal<string | null>(null)
  const checked = signal(new Set<string>())
  const outcomes = signal<Record<string, Outcome>>({})
  const cleaning = signal(false)

  const load = async () => {
    candidates.set(null)
    failure.set(null)
    try {
      const list = await api.surveyCleanup()
      checked.set(new Set(list.filter((candidate) => candidate.done && candidate.blockers.length === 0).map((candidate) => candidate.branch)))
      candidates.set(list)
    } catch (error) {
      failure.set(messageOf(error))
    }
  }
  void load()

  const toggle = (branch: string) => {
    const next = new Set(checked())
    if (next.has(branch)) next.delete(branch)
    else next.add(branch)
    checked.set(next)
  }
  const selected = () => (candidates() ?? []).filter((candidate) => checked().has(candidate.branch))
  const finished = () => !cleaning() && Object.keys(outcomes()).length > 0
  const failed = () => Object.values(outcomes()).filter((outcome) => outcome.state === 'failed').length
  const record = (branch: string, outcome: Outcome) => outcomes.set({ ...outcomes(), [branch]: outcome })

  // One at a time: each removal stops servers and runs git, and two at once would race on the repo.
  const start = async () => {
    cleaning.set(true)
    for (const candidate of selected()) {
      record(candidate.branch, { state: 'running' })
      try {
        await api.cleanupBranch(candidate.branch)
        record(candidate.branch, { state: 'done' })
      } catch (error) {
        record(candidate.branch, { state: 'failed', error: messageOf(error) })
      }
    }
    cleaning.set(false)
    void app.refresh()
  }

  return (
    <Dialog title={t('清理已完成的 worktree')} onClose={close} width={600}>
      <If
        when={candidates()}
        else={
          <If
            when={failure()}
            else={
              <View class="flex-row items-center gap-2 py-6">
                <Spinner size={14} />
                <Text class="text-[13px] text-fg-2">{t('正在逐个检查 worktree 的 PR 和本地改动…')}</Text>
              </View>
            }
          >
            {(error) => (
              <View class="gap-3 py-4">
                <Text class="text-[13px] text-err">{t('检查失败：{error}', { error: error() })}</Text>
                <View class="flex-row justify-end gap-2">
                  <Button onPress={close}>{t('关闭')}</Button>
                  <Button tone="accent" onPress={() => void load()}>
                    {t('重试')}
                  </Button>
                </View>
              </View>
            )}
          </If>
        }
      >
        {(list) => (
          <If
            when={list().length > 0}
            else={
              <View class="py-6">
                <EmptyState
                  icon={<Icon name="git-branch" size={20} tint="fg-2" />}
                  title={t('没有可清理的 worktree')}
                  detail={t('除当前检出外，没有 TeaBranch 建的 worktree。')}
                />
              </View>
            }
          >
            <Text class="mb-3 text-[12.5px] text-fg-2">
              {t('PR 已合并或已并入主干、本机没有多余改动的分支已经勾上。勾上被拦住的分支，会连它那些只在本机的提交和改动一起删掉。')}
            </Text>
            <View class="rounded-lg border border-border">
              <Each of={list()} key={(candidate) => candidate.branch}>
                {(candidate, index) => (
                  <Row
                    candidate={candidate()}
                    first={index() === 0}
                    checked={checked().has(candidate().branch)}
                    locked={cleaning() || finished()}
                    outcome={outcomes()[candidate().branch]}
                    onToggle={() => toggle(candidate().branch)}
                  />
                )}
              </Each>
            </View>
            <View class="mt-4 flex-row items-center gap-2">
              <Text class="min-w-0 flex-1 text-[12px] text-fg-2" style={{ numberOfLines: 2 }}>
                {finished()
                  ? failed() > 0
                    ? t('{n} 个没清理成功', { n: failed() })
                    : t('清理完成')
                  : t('已选 {n} 个，会删除 worktree 目录和本地分支', { n: selected().length })}
              </Text>
              <If
                when={finished()}
                else={
                  <>
                    <Button disabled={cleaning()} onPress={close}>
                      {t('取消')}
                    </Button>
                    <Button
                      tone="danger"
                      disabled={cleaning() || selected().length === 0}
                      icon={cleaning() ? <Spinner size={12} /> : <Icon name="trash-2" size={14} tint="#ffffff" />}
                      onPress={() => void start()}
                    >
                      {t('清理 {n} 个', { n: selected().length })}
                    </Button>
                  </>
                }
              >
                <Button tone="accent" onPress={close}>
                  {t('关闭')}
                </Button>
              </If>
            </View>
          </If>
        )}
      </If>
    </Dialog>
  )
}

function Row(props: { candidate: CleanupCandidate; first: boolean; checked: boolean; locked: boolean; outcome?: Outcome; onToggle: () => void }) {
  const candidate = () => props.candidate
  return (
    <View class={cn('flex-row items-start gap-2.5 px-3 py-2.5', !props.first && 'border-t border-border')}>
      <Checkbox
        checked={props.checked}
        disabled={props.locked}
        class={cn(
          'mt-0.5 size-3.5 items-center justify-center rounded border',
          props.checked ? 'border-primary bg-primary' : 'border-input bg-card',
          props.locked && 'opacity-50',
        )}
        indicator={
          <If when={props.checked}>
            <Icon name="check" size={10} tint="#ffffff" />
          </If>
        }
        onChange={props.onToggle}
        accessibilityLabel={candidate().branch}
      />
      <View class="min-w-0 flex-1 gap-0.5">
        <View class="flex-row items-center gap-2">
          <Text class="min-w-0 shrink font-mono text-[12.5px] text-fg" style={{ numberOfLines: 1 }}>
            {candidate().branch}
          </Text>
          <If when={candidate().issueKey}>{(key) => <Text class="text-[11px] text-fg-3">{key()}</Text>}</If>
        </View>
        <If when={candidate().issueTitle}>
          {(title) => (
            <Text class="text-[11.5px] text-fg-2" style={{ numberOfLines: 1 }}>
              {title()}
            </Text>
          )}
        </If>
        <View class="flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
          <View class="flex-row items-center gap-1">
            <Icon name={candidate().done ? 'git-merge' : 'git-pull-request'} size={12} tint={candidate().done ? 'ok' : 'fg-3'} />
            <Text class={cn('text-[11.5px]', candidate().done ? 'text-ok' : 'text-fg-2')}>{candidate().summary}</Text>
          </View>
          <If when={candidate().blockers.length > 0}>
            <Text class="min-w-0 shrink text-[11.5px] text-warn" style={{ numberOfLines: 2 }}>
              {candidate().blockers.join(t('，'))}
            </Text>
          </If>
        </View>
      </View>
      <If when={props.outcome}>
        {(outcome) => (
          <View class="flex-row items-center gap-1 pt-0.5">
            <If when={outcome().state === 'running'}>
              <Spinner size={12} />
            </If>
            <If when={outcome().state === 'done'}>
              <Icon name="check" size={13} tint="ok" />
              <Text class="text-[11.5px] text-ok">{t('已清理')}</Text>
            </If>
            <If when={outcome().state === 'failed' ? (outcome() as { error: string }).error : undefined}>
              {(error) => (
                <Text class="max-w-[200px] text-[11.5px] text-err" style={{ numberOfLines: 2 }}>
                  {error()}
                </Text>
              )}
            </If>
          </View>
        )}
      </If>
    </View>
  )
}
