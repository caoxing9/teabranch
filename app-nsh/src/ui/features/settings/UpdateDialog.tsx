import { Scroll, Text, View, signal, windowSize } from 'nsh'
import { Dialog as BaseDialog } from 'nsh/base'
import { t } from '../../../shared/i18n'
import { Icon } from '../../components/Icon'
import { Button, Spinner } from '../../components/kit'
import { Markdown } from '../../components/Markdown'
import { updates } from '../../store/updates'

/**
 * A new version: what changed since the one running, and the one button that matters. The download
 * runs on its own; the window shows where it stands and, once the app is unpacked, restarts into it.
 */
export function UpdateDialog() {
  const state = () => updates.state()
  const latest = () => state().latest
  const height = signal(0)
  const top = () => Math.max(0, Math.round((windowSize().height - height()) / 2))
  const busy = () => state().status === 'downloading' || state().status === 'checking' || state().status === 'installing'
  return (
    <BaseDialog
      open
      animation="fade"
      closeOnEscape
      closeOnBackdropPress
      onClose={() => updates.dismiss()}
      backdropClass="bg-black/40"
      backdropTestID="dialog-backdrop"
      class="items-center"
    >
      <View
        class="overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
        style={{ width: Math.min(720, windowSize().width - 64), maxHeight: Math.round(windowSize().height * 0.84), marginTop: top() }}
        onLayout={(e) => height.set(e.bounds.size.height)}
      >
        <View class="flex-row items-baseline gap-3 border-b border-border px-6 py-4">
          <Text class="text-[16px] font-semibold text-fg">{t('更新到 v{version}', { version: latest()?.version ?? '' })}</Text>
          <Text class="min-w-0 shrink text-[12.5px] text-fg-2" style={{ numberOfLines: 1 }}>
            {t('自 v{version} 以来的更新内容', { version: state().current })}
          </Text>
        </View>
        <Scroll class="min-h-0 shrink" contentClass="px-6 py-4">
          <Markdown text={latest()?.notes || t('这个版本没有写更新说明。')} />
        </Scroll>
        <View class="flex-row items-center gap-3 border-t border-border px-6 py-3.5">
          <View class="min-w-0 flex-1 flex-row items-center gap-2">
            <If when={busy()}>
              <Spinner size={12} />
            </If>
            <If when={state().status === 'ready'}>
              <Icon name="check" size={14} tint="ok" />
            </If>
            <Text
              class={state().status === 'failed' ? 'min-w-0 shrink text-[12px] text-err' : 'min-w-0 shrink text-[12px] text-fg-2'}
              style={{ numberOfLines: 2 }}
            >
              {footer(state())}
            </Text>
          </View>
          <Button onPress={() => updates.dismiss()}>{t('稍后')}</Button>
          <If when={state().status === 'failed'}>
            <Button tone="accent" icon={<Icon name="refresh-cw" size={13} tint="#ffffff" />} onPress={() => void updates.check()}>
              {t('重试')}
            </Button>
          </If>
          <If when={state().status === 'ready'}>
            <Button tone="accent" icon={<Icon name="arrow-up" size={13} tint="#ffffff" />} onPress={() => void updates.install()}>
              {t('重启以更新')}
            </Button>
          </If>
        </View>
      </View>
    </BaseDialog>
  )
}

/** "Downloading v0.19.0… 42%" — the percentage when the server said how much is coming. */
export function downloading(state: ReturnType<typeof updates.state>): string {
  const version = state.latest?.version ?? ''
  return state.progress === undefined
    ? t('正在下载 v{version}…', { version })
    : t('正在下载 v{version}… {percent}%', { version, percent: Math.round(state.progress * 100) })
}

function footer(state: ReturnType<typeof updates.state>): string {
  switch (state.status) {
    case 'downloading':
      return downloading(state)
    case 'checking':
      return t('正在检查…')
    case 'installing':
      return t('正在重启…')
    case 'ready':
      return state.bundle ? t('下载好了，重启后就是新版本') : t('开发版不能自动安装，新版本在 {path}', { path: state.staged ?? '' })
    case 'failed':
      return state.error ?? ''
    default:
      return ''
  }
}
