import type { UpdateState } from '../../shared/types'
import { api, messageOf, on } from '../lib/api'
import { app } from './app'
import { createStore } from './base'

interface UpdatesState {
  state: UpdateState
  /** The update window is open. */
  show: boolean
}

const fields = createStore<UpdatesState>({
  state: { current: '', status: 'idle' },
  show: false,
})

let listening = false
/** The version the window opened by itself for: once per version, 稍后 means later. */
let announced: string | undefined

export const updates = {
  ...fields,

  async init(): Promise<void> {
    fields.set({ state: await api.updateState() })
    if (listening) return
    listening = true
    on('updateState', (state) => {
      fields.set({ state })
      if (state.status === 'ready' && state.latest && announced !== state.latest.version) {
        announced = state.latest.version
        fields.set({ show: true })
      }
    })
    on('menu', (action) => {
      if (action !== 'checkUpdate') return
      app.openSettings('about')
      void updates.check()
    })
  },

  /** A new version is on its way or waiting: what the sidebar's pill stands for. */
  pending: (): boolean => {
    const status = fields.state().status
    return status === 'ready' || status === 'downloading' || status === 'installing'
  },

  async check(): Promise<void> {
    // The outcome, a failure included, arrives as state.
    await api.checkUpdate().catch(() => undefined)
  },

  open(): void {
    fields.set({ show: true })
  },

  dismiss(): void {
    fields.set({ show: false })
  },

  async install(): Promise<void> {
    try {
      await api.installUpdate()
    } catch (error) {
      fields.set({ state: { ...fields.state(), status: 'failed', error: messageOf(error) } })
    }
  },
}
