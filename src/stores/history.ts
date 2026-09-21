/**
 * 历史记录 store：localStorage 读写 + 响应式列表。
 * 纯逻辑（记录结构、汇总、校验）都在 core/history.ts 里，这里只负责落地与持久化。
 *
 * 存储设计：
 * - `shuangpin.history.v1`：已结算的历史记录列表
 * - `shuangpin.active.v1`：当前这一轮的「进行中」快照（每完成一题覆盖一次）
 *
 * 用「进行中快照」而不是「每完成一题追加一条」，是为了让**一轮练习 = 一条记录**：
 * 关页面/刷新不会把一轮练习切成一堆碎记录，同时也不会丢数据
 * （下次打开时 initHistory 会把没结算的那轮自动补进历史）。
 */

import { computed, ref } from 'vue'

import {
  aggregateCharErrors,
  buildSessionRecord,
  exportHistory,
  isWorthSaving,
  mergeRecords,
  parseActive,
  parseHistory,
  pushRecord,
  serializeActive,
  serializeHistory,
  summarize,
  type SessionMeta,
  type SessionRecord,
} from '../core/history.ts'
import type { StatsSnapshot } from '../core/stats.ts'

const HISTORY_KEY = 'shuangpin.history.v1'
const ACTIVE_KEY = 'shuangpin.active.v1'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* 隐私模式 / 配额不足：不影响练习本身，只是不持久化 */
  }
}

/** 已结算的历史记录（最新的在最前面） */
export const records = ref<SessionRecord[]>([])
/** 当前进行中的那轮快照 */
export const active = ref<SessionRecord | null>(null)

let initialized = false

/**
 * 初始化。幂等，可在 App 挂载时放心调用。
 * 如果上次没点「结束本轮」就关了页面，这里会把进行中那轮补进历史。
 */
export function initHistory(): void {
  if (initialized) return
  initialized = true
  const loaded = parseHistory(read(HISTORY_KEY))
  const orphan = parseActive(read(ACTIVE_KEY))
  if (orphan && isWorthSaving(orphan)) {
    records.value = pushRecord(loaded, orphan)
    persist()
  } else {
    records.value = loaded
  }
  active.value = null
  write(ACTIVE_KEY, null)
}

function persist(): void {
  write(HISTORY_KEY, serializeHistory(records.value))
}

export function newRecordId(prefix = 'r'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/** 覆盖式写入「进行中」快照（够格才写，避免存垃圾） */
export function checkpointActive(snapshot: StatsSnapshot, meta: SessionMeta): void {
  const record = buildSessionRecord(snapshot, meta)
  active.value = record
  if (isWorthSaving(record)) write(ACTIVE_KEY, serializeActive(record))
}

export function clearActive(): void {
  active.value = null
  write(ACTIVE_KEY, null)
}

/**
 * 结算当前一轮。
 * @returns 记录本身（即使不够格存历史也要返回，供结算面板展示）+ 是否真的存进了历史
 */
export function finalizeActive(snapshot: StatsSnapshot, meta: SessionMeta): { record: SessionRecord; saved: boolean } {
  const record = buildSessionRecord(snapshot, meta)
  const saved = isWorthSaving(record)
  if (saved) {
    records.value = pushRecord(records.value, record)
    persist()
  }
  clearActive()
  return { record, saved }
}

export function removeRecord(id: string): void {
  records.value = records.value.filter((r) => r.id !== id)
  persist()
}

export function clearHistory(): void {
  records.value = []
  persist()
  clearActive()
}

export const historySummary = computed(() => summarize(records.value))

/**
 * 汇总历史里所有轮次的错字，按出错次数从高到低。
 * 「易错复习」模式用它来出题。
 */
export const aggregatedCharErrors = computed<Array<{ char: string; count: number }>>(() =>
  aggregateCharErrors(records.value),
)

/** 导出为 JSON 文件（浏览器下载） */
export function downloadHistory(): string {
  const text = exportHistory(records.value)
  try {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `shuangpin-history-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    /* 下载失败也不影响页面 */
  }
  return text
}

/* ───────────────────────── 导入历史记录 ───────────────────────── */

export interface ParsedImport {
  records: SessionRecord[]
  /** 文件里有多少条被判定为坏数据（解析失败或字段不全） */
  invalid: number
}

/**
 * 解析导入文件的内容。
 * 兼容两种格式：`{ records: [...] }`（本应用的导出格式）和裸数组。
 * 逐条校验，坏数据丢掉而不是整个文件失败 —— 用户手改过的文件也能尽量救回来。
 */
export function parseImport(text: string): ParsedImport {
  const records = parseHistory(text)
  let rawCount = 0
  try {
    const parsed: unknown = JSON.parse(text)
    const raw =
      typeof parsed === 'object' && parsed !== null && 'records' in parsed
        ? (parsed as { records: unknown }).records
        : parsed
    if (Array.isArray(raw)) rawCount = raw.length
  } catch {
    /* 交给下面的判断统一处理 */
  }
  return { records, invalid: Math.max(0, rawCount - records.length) }
}

export type ImportMode = 'merge' | 'replace'

export interface ImportResult {
  ok: boolean
  /** 失败原因（ok=false 时） */
  message: string
  added: number
  skipped: number
  dropped: number
  total: number
}

/** 把解析出来的记录写进历史 */
export function applyImport(parsed: ParsedImport, mode: ImportMode): ImportResult {
  if (parsed.records.length === 0) {
    return { ok: false, message: '这个文件里没有可用的练习记录', added: 0, skipped: 0, dropped: 0, total: records.value.length }
  }

  if (mode === 'replace') {
    const incoming = mergeRecords([], parsed.records)
    records.value = incoming.records
    persist()
    return {
      ok: true,
      message: '',
      added: incoming.records.length,
      skipped: 0,
      dropped: incoming.dropped,
      total: records.value.length,
    }
  }

  const merged = mergeRecords(records.value, parsed.records)
  records.value = merged.records
  persist()
  return { ok: true, message: '', added: merged.added, skipped: merged.skipped, dropped: merged.dropped, total: records.value.length }
}

/**
 * 读文件文本。JSON 规范上是 UTF-8，但 Windows 上的记事本可能存成 GBK，
 * 直接按 UTF-8 读会得到乱码导致解析失败，所以退一步用 GBK 再试一次。
 */
export async function readTextFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  // U+FFFD 是解码失败的替换字符：出现它说明这份数据大概率不是 UTF-8
  if (!utf8.includes('\uFFFD')) return utf8
  try {
    return new TextDecoder('gbk', { fatal: false }).decode(buffer)
  } catch {
    return utf8
  }
}
