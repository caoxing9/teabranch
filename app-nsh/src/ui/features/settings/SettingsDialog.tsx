import { type JSX, Scroll, Text, View, windowSize } from 'nsh'
import { Dialog as BaseDialog } from 'nsh/base'
import { t } from '../../../shared/i18n'
import { Icon, type IconName } from '../../components/Icon'
import { IconButton } from '../../components/kit'
import { cn } from '../../lib/utils'
import { type SettingsPage, app } from '../../store/app'
import { type AutopilotPage, autopilot } from '../../store/autopilot'
import { SettingsMain } from './SettingsMain'

/**
 * The settings window: a sheet over the app with the pages down its left side and the page on the
 * right, the way the system's and most Mac apps' preferences are laid out. The entries under 托管
 * lead to autopilot's own pages, which stay where they are.
 */
export function SettingsDialog() {
  const close = () => app.set({ showSettings: false })
  const width = () => Math.min(1040, windowSize().width - 64)
  const height = () => Math.min(720, windowSize().height - 64)
  // The host centres the sheet across the window but hangs it from the top.
  const top = () => Math.max(0, Math.round((windowSize().height - height()) / 2))
  return (
    <BaseDialog
      open
      animation="fade"
      closeOnEscape
      closeOnBackdropPress
      onClose={close}
      backdropClass="bg-black/40"
      backdropTestID="dialog-backdrop"
      class="items-center"
    >
      <View class="flex-row overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl" style={{ width: width(), height: height(), marginTop: top() }}>
        <Scroll class="w-56 shrink-0 border-r border-sidebar-border bg-sidebar" contentClass="gap-0.5 px-2 py-3">
          <NavGroup label={t('通用')} first />
          <NavItem page="appearance" icon="eye" label={t('外观')} />
          <NavItem page="repo" icon="folder" label={t('仓库')} />
          <NavItem page="terminal" icon="terminal" label={t('终端')} />
          <NavItem page="about" icon="info" label={t('关于')} />
          <NavGroup label="AI" />
          <NavItem page="models" icon="cpu" label={t('模型')} />
          <NavGroup label={t('Issue 自动修复')} />
          <NavItem page="issueTeable" icon="table-2" label={t('Teable 表')} />
          <NavItem page="issueFix" icon="wrench" label={t('修复')} />
          <NavItem page="issueReview" icon="badge-check" label="Review" />
          <NavItem page="issuePrompt" icon="file-text" label="Prompt" />
          <NavGroup label={t('托管')} />
          <Link page="teable" icon="table-2" label="Teable" />
          <Link page="feishu" icon="message-circle" label={t('飞书')} />
          <Link page="github" icon="git-pull-request" label="GitHub" />
          <Link page="router" icon="route" label="Router" />
          <Link page="worker" icon="bot" label="Worker" />
        </Scroll>
        <View class="relative min-w-0 flex-1">
          <SettingsMain />
          <IconButton label={t('关闭')} class="absolute top-3 right-3" onPress={close}>
            <Icon name="x" size={15} tint="fg-2" />
          </IconButton>
        </View>
      </View>
    </BaseDialog>
  )
}

function NavGroup(props: { label: string; first?: boolean }) {
  return <Text class={cn('px-2 pb-1 text-[11px] font-medium text-fg-3', props.first ? 'pt-1' : 'pt-4')}>{props.label}</Text>
}

function NavItem(props: { page: SettingsPage; icon: IconName; label: string }) {
  const current = () => app.settingsPage() === props.page
  return <Entry icon={props.icon} label={props.label} current={current()} onPress={() => app.openSettings(props.page)} />
}

/** An autopilot page, reached from here: the arrow says it leaves the settings. */
function Link(props: { page: AutopilotPage; icon: IconName; label: string }) {
  return (
    <Entry
      icon={props.icon}
      label={props.label}
      current={false}
      trailing={<Icon name="arrow-up-right" size={13} tint="fg-3" />}
      onPress={() => {
        app.set({ showSettings: false })
        void autopilot.show(props.page)
      }}
    />
  )
}

function Entry(props: { icon: IconName; label: string; current: boolean; trailing?: JSX.Element; onPress: () => void }) {
  return (
    <View
      class={cn('h-8 flex-row items-center gap-2 rounded-lg px-2', props.current ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/60')}
      role="button"
      onPress={props.onPress}
    >
      <Icon name={props.icon} size={16} tint={props.current ? 'fg' : 'fg-2'} />
      <Text class={cn('min-w-0 flex-1 text-[13px]', props.current ? 'font-medium text-fg' : 'text-fg-2')} style={{ numberOfLines: 1 }}>
        {props.label}
      </Text>
      {props.trailing}
    </View>
  )
}
