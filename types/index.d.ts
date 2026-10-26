export type Limite = { kind: string; percentUsed: number; resetsAt?: string }

export type Medida = {
  usado: number | null
  tokens: number | null
  ventana: number
  limites: Limite[]
  usd: number | null
}

export type ChatRegistro = {
  id: string
  nombre: string
  inicio: number
  fin: number | null
  picoPct: number
  ultimoPct: number
  motivo: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'sif-gestor-chats': {
      medida: Shaped<Medida | null>
      historial: Shaped<number[]>
      nombre: string
      avisado: number
      chats: Shaped<ChatRegistro[]>
    }
  }
}
