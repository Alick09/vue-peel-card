import type { DefineComponent, Plugin } from 'vue'

export interface PeelCardItem {
  /** Front side color (CSS color), backdrop under the html. */
  bg: string
  /** Back side paper color, #rrggbb. */
  back: string
  /** Card content: well-formed XHTML with styles inside. */
  html: string
}

export interface PeelCardProps {
  cards: PeelCardItem[]
  toggle?: boolean
  width?: number
  height?: number
  radius?: number
  background?: string
  padding?: number
  maxScale?: number
  hint?: boolean
  clickPeel?: boolean
  label?: string
}

export interface PeelCardExposed {
  /** Peel off; in toggle mode switches the state. */
  peel(angle?: number): void
}

export const PeelCard: DefineComponent<PeelCardProps>
export const PeelCardPlugin: Plugin
declare const _default: typeof PeelCard
export default _default
