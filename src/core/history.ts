/**
 * 历史记录的纯逻辑层：记录结构、构建、汇总、序列化与校验。
 * 不碰 localStorage（那部分在 stores/history.ts），所以这里可以完整跑单测。
 *
 * 记录粒度是「一轮练习」：从开始练到点「结束本轮」或关掉页面为止。
 * 一轮练习在内存里持续更新，并在 localStorage 里存一份「进行中」快照，
 * 这样关掉页面也不会丢；下次打开时把没结算的那轮自动补进历史。
 * 这样做的好处是「一轮 = 一条记录」，不会因为切页/刷新把一轮练习切碎成好几条。
 */

import type { KeyTimeEntry, StatsSnapshot } from './stats.ts'

export const HISTORY_VERSION = 1
/** 历史记录条数上限（超出丢最旧的），避免 localStorage 无限增长 */
export const HISTORY_LIMIT = 200
/** 至少完成这么多题才值得存成一条记录（过滤掉误触产生的垃圾数据） */
export const MIN_QUESTIONS_TO_SAVE = 3

export interface SessionMeta {
  id: string
  startedAt: number
  endedAt: number
  schemeId: string
  schemeName: string
  modeId: string
  modeName: string
}

export interface SessionRecord {
  id: string
  startedAt: number
  endedAt: number
  schemeId: string
  schemeName: string
  modeId: string
  modeName: string
  /** 完成题数 */
  done: number
  /** 完全独立完成的题数（没按错、也没用提示） */
  independent: number
  /** 依赖提示完成的题数（含卡住自动闪键位、自己按 Tab 看答案） */
  hinted: number
  /** 错误击键数 */
  errors: number
  /** 总击键数 */
  keystrokes: number
  /** 有效用时（毫秒） */
  elapsedMs: number
  /** 字/分 */
  cpm: number
  /** 键/分 */
  kpm: number
  /** 独立正确率（不含靠提示完成的题） */
  independentRate: number
  /** 依赖提示率 */
  hintedRate: number
  /** 按键正确率 */
  keyAccuracy: number
  /** 最长连击 */
  maxCombo: number
  keyErrors: Record<string, number>
  charErrors: Record<string, number>
  keyTimes: Record<string, KeyTimeEntry>
}

/** 由统计快照 + 元信息构建一条记录 */
export function buildSessionRecord(snapshot: StatsSnapshot, meta: SessionMeta): SessionRecord {
  return {
    id: meta.id,
    startedAt: meta.startedAt,
    endedAt: meta.endedAt,
    schemeId: meta.schemeId,
    schemeName: meta.schemeName,
    modeId: meta.modeId,
    modeName: meta.modeName,
    done: snapshot.done,
    independent: snapshot.independent,
    hinted: snapshot.hinted,
    errors: snapshot.errors,
    keystrokes: snapshot.keystrokes,
    elapsedMs: snapshot.elapsedMs,
    cpm: snapshot.cpm,
    kpm: snapshot.kpm,
    independentRate: snapshot.independentRate,
    hintedRate: snapshot.hintedRate,
    keyAccuracy: snapshot.keyAccuracy,
    maxCombo: snapshot.maxCombo,
    keyErrors: { ...snapshot.keyErrors },
    charErrors: { ...snapshot.charErrors },
    keyTimes: { ...snapshot.keyTimes },
  }
}

/** 这条记录是否值得存入历史 */
export function isWorthSaving(record: SessionRecord): boolean {
  return record.done >= MIN_QUESTIONS_TO_SAVE
}

export interface HistorySummary {
  sessions: number
  totalDone: number
  totalMs: number
  avgCpm: number
  bestCpm: number
  avgIndependentRate: number
  avgHintedRate: number
  lastCpm: number
}

const EMPTY_SUMMARY: HistorySummary = {
  sessions: 0,
  totalDone: 0,
  totalMs: 0,
  avgCpm: 0,
  bestCpm: 0,
  avgIndependentRate: 0,
  avgHintedRate: 0,
  lastCpm: 0,
}

export function summarize(records: readonly SessionRecord[]): HistorySummary {
  if (records.length === 0) return { ...EMPTY_SUMMARY }
  let totalDone = 0
  let totalMs = 0
  let cpmSum = 0
  let independentSum = 0
  let hintedSum = 0
  let bestCpm = 0
  for (const record of records) {
    totalDone += record.done
    totalMs += record.elapsedMs
    cpmSum += record.cpm
    independentSum += record.independentRate
    hintedSum += record.hintedRate
    if (record.cpm > bestCpm) bestCpm = record.cpm
  }
  return {
    sessions: records.length,
    totalDone,
    totalMs,
    avgCpm: cpmSum / records.length,
    bestCpm,
    avgIndependentRate: independentSum / records.length,
    avgHintedRate: hintedSum / records.length,
    lastCpm: records[0].cpm,
  }
}

/** 新记录插到最前面，并裁到上限 */
export function pushRecord(records: readonly SessionRecord[], record: SessionRecord): SessionRecord[] {
  return [record, ...records.filter((r) => r.id !== record.id)].slice(0, HISTORY_LIMIT)
}

export interface MergeResult {
  /** 合并后的列表（最新在前，已裁到上限） */
  records: SessionRecord[]
  /** 真正加进来的条数 */
  added: number
  /** 因为 id 已存在而跳过的条数（重复导入同一份文件时全是这个） */
  skipped: number
  /** 因为超出上限被丢掉的条数 */
  dropped: number
}

/**
 * 合并两份历史（导入用）。
 * 按 id 去重：同一份文件导入两次不会产生重复记录。
 * 结果按结束时间倒序 —— 不假设导入文件的顺序是对的。
 */
export function mergeRecords(
  existing: readonly SessionRecord[],
  incoming: readonly SessionRecord[],
): MergeResult {
  const byId = new Map<string, SessionRecord>()
  for (const record of existing) byId.set(record.id, record)

  let added = 0
  let skipped = 0
  for (const record of incoming) {
    if (byId.has(record.id)) {
      skipped += 1
      continue
    }
    byId.set(record.id, record)
    added += 1
  }

  const merged = [...byId.values()].sort((a, b) => b.endedAt - a.endedAt)
  const records = merged.slice(0, HISTORY_LIMIT)
  return { records, added, skipped, dropped: merged.length - records.length }
}

/** 序列化（带版本号，方便以后迁移） */
export function serializeHistory(records: readonly SessionRecord[]): string {
  return JSON.stringify({ version: HISTORY_VERSION, records })
}

/** 校验单条记录（存储里的东西可能被手改或写坏） */
export function parseRecord(value: unknown): SessionRecord | null {
  if (!isRecord(value)) return null
  return normalizeRecord(value)
}

/**
 * 反序列化 + 校验历史列表。存储里的东西可能是旧版本、被手改过、或者写坏了，
 * 所以这里逐条校验并丢弃坏数据，宁可少几条也不能让页面崩掉。
 */
export function parseHistory(text: string | null): SessionRecord[] {
  if (!text) return []
  try {
    const parsed: unknown = JSON.parse(text)
    const raw =
      typeof parsed === 'object' && parsed !== null && 'records' in parsed
        ? (parsed as { records: unknown }).records
        : parsed
    if (!Array.isArray(raw)) return []
    return raw
      .map((item) => parseRecord(item))
      .filter((item): item is SessionRecord => item !== null)
      .slice(0, HISTORY_LIMIT)
  } catch {
    return []
  }
}

/** 补齐可能缺失的字段（旧记录 / 手改数据），保证界面不会读到 undefined */
function normalizeRecord(record: SessionRecord): SessionRecord {
  // M5 之前的记录用的是 clean / cleanRate，这里做一次兼容映射
  const legacy = record as unknown as { clean?: number; cleanRate?: number }
  return {
    ...record,
    charErrors: record.charErrors ?? {},
    keyTimes: record.keyTimes ?? {},
    keyErrors: record.keyErrors ?? {},
    schemeName: record.schemeName ?? '小鹤双拼',
    modeName: record.modeName ?? '全部拼音组合',
    keystrokes: record.keystrokes ?? 0,
    errors: record.errors ?? 0,
    done: record.done ?? 0,
    independent: record.independent ?? legacy.clean ?? 0,
    hinted: record.hinted ?? 0,
    elapsedMs: record.elapsedMs ?? 0,
    kpm: record.kpm ?? 0,
    independentRate: record.independentRate ?? legacy.cleanRate ?? 1,
    hintedRate: record.hintedRate ?? 0,
    keyAccuracy: record.keyAccuracy ?? 1,
    maxCombo: record.maxCombo ?? 0,
    startedAt: record.startedAt ?? record.endedAt,
  }
}

function isRecord(value: unknown): value is SessionRecord {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  const rateOk = typeof r.independentRate === 'number' || typeof r.cleanRate === 'number'
  return (
    typeof r.id === 'string' &&
    typeof r.endedAt === 'number' &&
    typeof r.done === 'number' &&
    typeof r.cpm === 'number' &&
    rateOk &&
    typeof r.keyErrors === 'object' &&
    r.keyErrors !== null
  )
}

export function parseActive(text: string | null): SessionRecord | null {
  if (!text) return null
  try {
    return parseRecord(JSON.parse(text))
  } catch {
    return null
  }
}

export function serializeActive(record: SessionRecord | null): string | null {
  if (!record) return null
  return JSON.stringify(record)
}

/* ───────────────── 多轮聚合（历史热力图用）───────────────── */

export interface KeyErrorSummary {
  /** 键码 -> 累计错误次数（直接喂给键位图着色） */
  errors: Record<string, number>
  /** 合计错误击键次数 */
  total: number
  /** 参与统计的轮数 */
  rounds: number
  /** 涉及多少个不同的键 */
  keys: number
  /** 按次数排序的前几名 */
  top: Array<{ key: string; count: number }>
}

/**
 * 累计多轮的错误击键。
 * 这是「长期最常按错哪些键」的数据来源 —— 单轮数据噪声太大，
 * 累计之后才看得出哪些键是真的没记牢。
 */
export function aggregateKeyErrors(records: readonly SessionRecord[], limit = 8): KeyErrorSummary {
  const errors: Record<string, number> = {}
  let total = 0
  for (const record of records) {
    for (const [code, count] of Object.entries(record.keyErrors ?? {})) {
      errors[code] = (errors[code] ?? 0) + count
      total += count
    }
  }
  const sorted = Object.entries(errors)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1))
  return { errors, total, rounds: records.length, keys: sorted.length, top: sorted.slice(0, limit) }
}

/** 累计多轮的错字（易错复习模式与历史复盘都用它） */
export function aggregateCharErrors(
  records: readonly SessionRecord[],
  limit = 0,
): Array<{ char: string; count: number }> {
  const merged = new Map<string, number>()
  for (const record of records) {
    for (const [char, count] of Object.entries(record.charErrors ?? {})) {
      merged.set(char, (merged.get(char) ?? 0) + count)
    }
  }
  const sorted = [...merged.entries()]
    .map(([char, count]) => ({ char, count }))
    .sort((a, b) => b.count - a.count || (a.char < b.char ? -1 : 1))
  return limit > 0 ? sorted.slice(0, limit) : sorted
}

/** 导出为可读 JSON（用户点「导出 JSON」时用） */
export function exportHistory(records: readonly SessionRecord[]): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), summary: summarize(records), records }, null, 2)
}

/** 把毫秒格式化成人看的时长 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/** 把时间戳格式化成 'MM-DD HH:mm' */
export function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
