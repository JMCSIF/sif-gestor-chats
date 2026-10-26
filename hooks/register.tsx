import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ChatRegistro, Limite, Medida } from '../types'

// Gestor de chats SIF: cuánto contexto queda en el chat, avisos al acercarse
// al límite, traspaso al chat nuevo y registro de los chats anteriores.

const PANE = 'sif-chats'
const TITULO = 'Chats SIF'
const AMBAR = 70 // % usado: ve cerrando el bloque
const ROJO = 85 // % usado: haz el acta de traspaso
const MAX_CHATS = 40
const MAX_HISTORIAL = 40

const PROMPT_TRASPASO =
  'Cierra esta sesión de SIF con la skill sif-acta-traspaso: actualiza el acta ' +
  '(bloques cerrados, bloque en curso y pendientes) y dame el mensaje de arranque ' +
  'para continuar en un chat nuevo.'

const medida = atom({ plugin: 'sif-gestor-chats', key: 'medida' } as const, null, { shape: 'medida-1' })
const historial = atom({ plugin: 'sif-gestor-chats', key: 'historial' } as const, [], { shape: 'historial-1' })
const nombre = atom({ plugin: 'sif-gestor-chats', key: 'nombre' } as const, 'Chat sin nombre')
const avisado = atom({ plugin: 'sif-gestor-chats', key: 'avisado' } as const, 0)
const chats = atom({ plugin: 'sif-gestor-chats', key: 'chats' } as const, [], { shape: 'chats-1' })

type $T = EngineInterface

// ---------- utilidades ----------

const miles = (n: number): string =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

const barra = (pct: number, ancho = 20): string => {
  const llenos = Math.max(0, Math.min(ancho, Math.round((pct / 100) * ancho)))
  return '█'.repeat(llenos) + '░'.repeat(ancho - llenos)
}

const chispa = (serie: number[]): string => {
  const marcas = '▁▂▃▄▅▆▇█'
  return serie
    .map(v => marcas[Math.max(0, Math.min(7, Math.floor((v / 100) * 8)))] ?? '▁')
    .join('')
}

type Estado = { color: 'success' | 'warning' | 'error' | 'subtle'; texto: string }

const estadoDe = (usado: number | null): Estado => {
  if (usado === null) return { color: 'subtle', texto: 'Sin medir todavía: aparece tras la primera respuesta' }
  if (usado >= ROJO) return { color: 'error', texto: 'Rojo: haz el acta de traspaso y abre un chat nuevo' }
  if (usado >= AMBAR) return { color: 'warning', texto: 'Ámbar: cierra el bloque en curso, no abras otro' }
  return { color: 'success', texto: 'Verde: hay sitio de sobra' }
}

const nombreLimite = (kind: string): string =>
  kind === 'five_hour' ? 'Límite 5 h' : kind === 'seven_day' ? 'Límite 7 días' : kind

const renueva = (iso: string | undefined, ahora: number): string => {
  if (!iso) return ''
  const ms = Date.parse(iso) - ahora
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const h = Math.floor(ms / 3_600_000)
  const m = Math.round((ms % 3_600_000) / 60_000)
  return h > 0 ? ` · se renueva en ${h} h ${m} min` : ` · se renueva en ${m} min`
}

const aMedida = (ctx: { tokens?: number; window: number; percent?: number }, limites: Limite[], usd?: number): Medida => ({
  usado: typeof ctx.percent === 'number' ? ctx.percent : null,
  tokens: typeof ctx.tokens === 'number' ? ctx.tokens : null,
  ventana: ctx.window,
  limites: limites.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
  usd: typeof usd === 'number' ? usd : null,
})

// Cambia el registro de este chat en la sesión y en el almacén persistente.
const tocarChat = async ($: $T, fn: (c: ChatRegistro) => ChatRegistro): Promise<void> => {
  const id = await $.session.id()
  const lista = await update($, chats, l => l.map(c => (c.id === id ? fn(c) : c)))
  await $.store.set('chats', lista)
}

const pedirTraspaso = async ($: $T): Promise<void> => {
  await tocarChat($, c => ({ ...c, motivo: 'traspaso pedido' }))
  await $.prompt.submit({ text: PROMPT_TRASPASO, asUser: true })
}

const renombrar = async ($: $T, texto: string): Promise<void> => {
  const limpio = texto.trim()
  if (!limpio) return
  await update($, nombre, () => limpio)
  await tocarChat($, c => ({ ...c, nombre: limpio }))
}

// ---------- hooks ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)

    await $.command.register({ name: 'chats', description: 'Abre el panel de chats SIF con el contexto restante' })
    await $.command.register({ name: 'chat-nombre', description: 'Pone nombre a este chat (p. ej. Hito 1 · Posiciones)' })
    await $.command.register({ name: 'chat-traspaso', description: 'Pide el acta de traspaso SIF para seguir en un chat nuevo' })

    // Recupera los chats guardados y da de alta este si es nuevo.
    const id = await $.session.id()
    const ahora = await $.clock.now()
    const guardados = (await $.store.get('chats')) as ChatRegistro[] | undefined
    let lista: ChatRegistro[] = Array.isArray(guardados) ? guardados : []
    let actual = lista.find(c => c.id === id)
    if (!actual) {
      actual = { id, nombre: 'Chat sin nombre', inicio: ahora, fin: null, picoPct: 0, ultimoPct: 0, motivo: null }
      lista = [...lista, actual].slice(-MAX_CHATS)
      await $.store.set('chats', lista)
    }
    await update($, chats, () => lista)
    await update($, nombre, () => actual.nombre)

    const u = await $.session.usage()
    await update($, medida, () => aMedida(u.context, u.rateLimits, u.cost?.usd))

    void $.ui.open({ id: PANE, title: TITULO })
    return ran
  })

  on('session.measure', async ($, e, next) => {
    const m = aMedida(e.context, e.rateLimits, e.cost?.usd)
    await update($, medida, () => m)

    if (m.usado !== null && e.changed.includes('context')) {
      const pct = m.usado
      await update($, historial, h => [...h, pct].slice(-MAX_HISTORIAL))
      await tocarChat($, c => ({ ...c, ultimoPct: pct, picoPct: Math.max(c.picoPct, pct) }))

      // Avisa una vez por umbral; si se compacta y baja, se rearma.
      const ya = await read($, avisado)
      if (pct >= ROJO && ya < ROJO) {
        await update($, avisado, () => ROJO)
        $.ui.toast(`Contexto al ${pct} %: quedan ${100 - pct} %. Usa /chat-traspaso`)
        void $.ui.notify(`Quedan ${100 - pct} % de contexto. Toca hacer el acta de traspaso.`, { title: TITULO })
      } else if (pct >= AMBAR && ya < AMBAR) {
        await update($, avisado, () => AMBAR)
        $.ui.toast(`Contexto al ${pct} %: cierra el bloque en curso`)
      } else if (pct < AMBAR && ya > 0) {
        await update($, avisado, () => 0)
      }
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    const ahora = await $.clock.now()
    await tocarChat($, c => ({ ...c, fin: ahora, motivo: c.motivo ?? e.reason }))
    return next(e)
  })

  on('command.run', { command: 'chats' }, async $ => {
    await $.ui.open({ id: PANE, title: TITULO })
    return { text: 'Panel de chats SIF abierto.' }
  })

  on('command.run', { command: 'chat-nombre' }, async ($, e) => {
    if (!e.args.trim()) return { text: 'Escribe el nombre detrás: /chat-nombre Hito 1 · Posiciones' }
    await renombrar($, e.args)
    return { text: `Chat renombrado: ${e.args.trim()}` }
  })

  on('command.run', { command: 'chat-traspaso' }, async $ => {
    await pedirTraspaso($)
    return { text: 'Pidiendo el acta de traspaso…' }
  })

  // Panel lateral
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const m = await read($, medida)
    const serie = await read($, historial)
    const titulo = await read($, nombre)
    const lista = await read($, chats)
    const id = await $.session.id()
    const ahora = await $.clock.now()

    const usado = m?.usado ?? null
    const est = estadoDe(usado)
    const anteriores = lista.filter(c => c.id !== id).slice(-6).reverse()

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text dimColor size="caption">CHAT ACTUAL</Text>
          <Text weight="semibold" wrap="truncate-end">{titulo}</Text>
        </Box>

        <Box flexDirection="column">
          <Text size="title" weight="bold" color={est.color} tabular>
            {usado === null ? 'Quedan —' : `Quedan ${100 - usado} %`}
          </Text>
          <Text color={est.color} tabular>{barra(usado ?? 0)} {usado === null ? '' : `${usado} % usado`}</Text>
          {m && (
            <Text dimColor tabular>
              {m.tokens === null ? '—' : miles(m.tokens)} de {miles(m.ventana)} tokens
            </Text>
          )}
          <Text color={est.color}>{est.texto}</Text>
        </Box>

        {serie.length > 1 && (
          <Box flexDirection="column">
            <Text dimColor size="caption">EVOLUCIÓN POR TURNO</Text>
            <Text color={est.color}>{chispa(serie.slice(-24))}</Text>
          </Box>
        )}

        {m && m.limites.length > 0 && (
          <Box flexDirection="column">
            <Text dimColor size="caption">LÍMITES DE USO DE LA CUENTA</Text>
            {m.limites.map(l => (
              <Text tabular>
                {nombreLimite(l.kind)}: quedan {Math.max(0, Math.round(100 - l.percentUsed))} %{renueva(l.resetsAt, ahora)}
              </Text>
            ))}
          </Box>
        )}

        <Box flexDirection="column" gap={1}>
          <Text dimColor>Ponle nombre con /chat-nombre Hito 1 · Posiciones</Text>
          <Button
            key="traspaso"
            variant={usado !== null && usado >= AMBAR ? 'primary' : 'secondary'}
            onPress={() => void pedirTraspaso($)}
          >
            Preparar traspaso
          </Button>
        </Box>

        <Box flexDirection="column">
          <Text dimColor size="caption">CHATS ANTERIORES</Text>
          {anteriores.length === 0 && <Text dimColor>Aún no hay. Se guardan solos al cerrar cada chat.</Text>}
          {anteriores.map(c => (
            <Text wrap="truncate-end" color={c.picoPct >= ROJO ? 'error' : c.picoPct >= AMBAR ? 'warning' : 'text'}>
              {c.nombre} · pico {c.picoPct} %{c.motivo === 'traspaso pedido' ? ' · traspasado' : c.fin ? ' · cerrado' : ''}
            </Text>
          ))}
        </Box>
      </Box>
    )
  })

  // Banda sobre la caja de texto: solo aparece en ámbar o rojo.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const m = await read($, medida)
    const usado = m?.usado ?? null
    if (e.props.hasSurvey || usado === null || usado < AMBAR) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const est = estadoDe(usado)
    return (
      <Box gap={1} flexWrap="wrap">
        <Text color={est.color} tabular>
          Contexto {usado} % · quedan {100 - usado} %
        </Text>
        <Button key="traspaso-banda" plain dimColor onPress={() => void pedirTraspaso($)}>
          Preparar traspaso
        </Button>
      </Box>
    )
  })
}
