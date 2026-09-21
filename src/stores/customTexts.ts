/**
 * 自定义文本存储。
 *
 * 关键点：**拼音在这里一次性转好并持久化**，出题时直接用现成的音节。
 * 因此 pinyin-pro（300KB+）用动态 import 按需加载——只有用户真的点
 * 「添加文本」那一刻才下载，首屏和日常练习完全不碰它。
 *
 * 另一个好处：转好的 parts 存进 localStorage 后，下次打开不用重新转换，
 * 也不依赖 pinyin-pro 是否加载成功。
 */

import { ref } from 'vue'

import { getScheme } from '../core/schemes/index.ts'
import { countHanzi, shortLabel, splitSyllables } from '../core/text.ts'
import { buildCustomParts } from '../generators/custom.ts'
import type { CustomTextPart } from '../generators/types.ts'

const STORAGE_KEY = 'shuangpin.customtexts.v1'
/** 单条文本最多多少个汉字 */
export const MAX_TEXT_CHARS = 3000
/** 最多保留多少条 */
export const MAX_TEXTS = 10

export interface CustomText {
  id: string
  name: string
  /** 原文（标点保留） */
  text: string
  /** 转好的音节序列 */
  parts: CustomTextPart[]
  addedAt: number
}

export const customTexts = ref<CustomText[]>([])
export const activeTextId = ref<string | null>(null)
/** 正在转换拼音（界面显示 loading） */
export const converting = ref(false)
export const convertError = ref('')

let initialized = false

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function write(): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeId: activeTextId.value, texts: customTexts.value }),
    )
  } catch {
    /* 配额不足等：不影响本次练习 */
  }
}

function isPart(value: unknown): value is CustomTextPart {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Partial<CustomTextPart>
  return typeof p.char === 'string' && typeof p.syllable === 'string'
}

export function initCustomTexts(): void {
  if (initialized) return
  initialized = true
  try {
    const parsed: unknown = JSON.parse(read() ?? 'null')
    if (typeof parsed !== 'object' || parsed === null) return
    const raw = (parsed as { texts?: unknown }).texts
    if (!Array.isArray(raw)) return
    const texts: CustomText[] = []
    for (const item of raw.slice(0, MAX_TEXTS)) {
      if (typeof item !== 'object' || item === null) continue
      const record = item as Partial<CustomText>
      if (typeof record.id !== 'string' || typeof record.text !== 'string') continue
      const parts = Array.isArray(record.parts) ? record.parts.filter(isPart) : []
      if (parts.length === 0) continue
      texts.push({
        id: record.id,
        name: record.name || shortLabel(record.text),
        text: record.text,
        parts,
        addedAt: record.addedAt ?? Date.now(),
      })
    }
    customTexts.value = texts
    const activeId = (parsed as { activeId?: unknown }).activeId
    activeTextId.value =
      typeof activeId === 'string' && texts.some((t) => t.id === activeId)
        ? activeId
        : (texts[0]?.id ?? null)
  } catch {
    /* 数据坏了就当没有 */
  }
}

/** 当前生效的自定义文本的音节序列 */
export function activeCustomParts(): CustomTextPart[] | null {
  const record = customTexts.value.find((t) => t.id === activeTextId.value) ?? customTexts.value[0]
  return record && record.parts.length > 0 ? record.parts : null
}

export function setActiveText(id: string): void {
  activeTextId.value = id
  write()
}

export function removeCustomText(id: string): void {
  customTexts.value = customTexts.value.filter((t) => t.id !== id)
  if (activeTextId.value === id) activeTextId.value = customTexts.value[0]?.id ?? null
  write()
}

type PinyinFn = (text: string, options: Record<string, unknown>) => unknown

let pinyinFn: PinyinFn | null = null

/** 按需加载 pinyin-pro（只在添加文本时发生） */
async function loadPinyin(): Promise<PinyinFn> {
  if (!pinyinFn) {
    const mod = await import('pinyin-pro')
    pinyinFn = mod.pinyin as unknown as PinyinFn
  }
  return pinyinFn
}

/** 把一段文本转成音节序列（按词语上下文判定多音字），并丢掉无法编码的音节 */
export function convertText(text: string, toSyllables: (t: string) => string[]): {
  parts: CustomTextPart[]
  dropped: number
} {
  const all = buildCustomParts(text, toSyllables)
  const scheme = getScheme('xiaohe')
  const parts: CustomTextPart[] = []
  let dropped = 0
  for (const part of all) {
    if (scheme.encode(part.syllable)) parts.push(part)
    else dropped += 1
  }
  return { parts, dropped }
}

/** 添加一段文本；成功返回记录，失败返回 null 并把原因写进 convertError */
export async function addCustomText(rawText: string): Promise<CustomText | null> {
  convertError.value = ''
  const text = rawText.trim()
  if (!text) {
    convertError.value = '文本是空的'
    return null
  }
  const hanzi = countHanzi(text)
  if (hanzi === 0) {
    convertError.value = '这段文本里没有汉字'
    return null
  }
  if (hanzi > MAX_TEXT_CHARS) {
    convertError.value = `太长了：${hanzi} 个汉字，最多 ${MAX_TEXT_CHARS} 个`
    return null
  }

  converting.value = true
  try {
    const fn = await loadPinyin()
    // 关键：pinyin-pro 的 array 输出会给**标点也返回一项**（和输入字符一一对应），
    // 而 alignDisplay 是按「汉字顺序」取音节的，直接混用会整体错位导致丢字。
    // 所以先把非汉字剔除再转拼音，长度就正好等于汉字数。
    const hanziOnly = text.replace(/[^\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g, '')
    const { parts, dropped } = convertText(text, () => {
      const result = fn(hanziOnly, { type: 'array', toneType: 'none', v: true })
      if (Array.isArray(result)) return result.map((s) => String(s))
      return splitSyllables(String(result))
    })
    if (parts.length === 0) {
      convertError.value = '这段文本没能转出可练习的汉字'
      return null
    }
    if (dropped > 0) {
      convertError.value = `已添加（其中 ${dropped} 个字无法用双拼编码，已跳过）`
    }
    const record: CustomText = {
      id: `text-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: shortLabel(text),
      text,
      parts,
      addedAt: Date.now(),
    }
    customTexts.value = [record, ...customTexts.value.filter((t) => t.text !== text)].slice(0, MAX_TEXTS)
    activeTextId.value = record.id
    write()
    return record
  } catch (error) {
    convertError.value = `拼音转换失败：${error instanceof Error ? error.message : String(error)}`
    return null
  } finally {
    converting.value = false
  }
}
