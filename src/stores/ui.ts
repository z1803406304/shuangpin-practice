/** 界面级状态：当前打开的面板、最近一次结算结果 */

import { ref } from 'vue'

import type { SessionRecord } from '../core/history.ts'

export type PanelKind = 'none' | 'result' | 'history' | 'settings' | 'custom' | 'scheme'

export const panel = ref<PanelKind>('none')

/** 最近一次结算的记录（结算面板读它） */
export const lastResult = ref<SessionRecord | null>(null)
/** 最近一次结算是否存进了历史 */
export const lastResultSaved = ref(false)

export function openResult(record: SessionRecord, saved: boolean): void {
  lastResult.value = record
  lastResultSaved.value = saved
  panel.value = 'result'
}

export function openHistory(): void {
  panel.value = 'history'
}

export function openSettings(): void {
  panel.value = 'settings'
}

export function openCustomTexts(): void {
  panel.value = 'custom'
}

export function openSchemeHelp(): void {
  panel.value = 'scheme'
}

export function closePanel(): void {
  panel.value = 'none'
}
