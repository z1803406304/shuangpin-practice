/**
 * 方案注册表。
 * 首版只实现小鹤双拼；后续加自然码 / 微软双拼 / 搜狗双拼，
 * 只需新建 schemes/<id>.ts 并 push 到这里。
 */

import { xiaoheScheme } from './xiaohe.ts'
import type { Scheme } from './types.ts'

export const SCHEMES: readonly Scheme[] = [xiaoheScheme]

export const DEFAULT_SCHEME_ID = xiaoheScheme.id

export function getScheme(id: string): Scheme {
  return SCHEMES.find((s) => s.id === id) ?? xiaoheScheme
}

export type { Encoded, KeyDef, Scheme, ZeroInitialEntry } from './types.ts'
