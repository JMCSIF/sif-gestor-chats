import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'sif-gestor-chats', component: 'Pane', requestId: 'sif-chats',
  props: { title: 'Chats SIF', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

test('el panel muestra lo que queda y el estado ámbar', async ($, on) => {
  mock.clock(on); mock.store(on)
  on('command.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.id', () => ({ value: 's1' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 50000, window: 200000, percent: 25 }, rateLimits: [] } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({ context: { tokens: 164000, window: 200000, percent: 82 }, rateLimits: [{ kind: 'five_hour', percentUsed: 30 }], changed: ['context'] })

  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Quedan 18 %/ }))?.text).toBe('Quedan 18 %')
    expect(await ui.find({ type: 'Text', text: /Ámbar/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /164\.000 de 200\.000/ })).toBeTruthy()
    await ui.unmount()
  }
})
