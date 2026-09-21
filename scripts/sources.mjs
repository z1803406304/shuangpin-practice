/**
 * 外部数据源统一入口（下载 + 缓存到 data-src/，该目录已 gitignore，可随时重下）。
 *
 * 数据源：
 * 1. 汉字字频表：ruddfawcett/hanziDB.csv（Jun Da《Modern Chinese Character Frequency List》）
 *    —— 用于挑「代表字」和计算音节常用度权重，也是 M4「常用汉字」模式的数据源。
 * 2. 小鹤官方码表：见 fetch-flypy-table.mjs —— 用于交叉验证编码器。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const DATA_SRC = resolve(ROOT, 'data-src')

const CHAR_FREQ_URL = 'https://raw.githubusercontent.com/ruddfawcett/hanziDB.csv/master/hanzi_db.csv'

export async function download(url, filename) {
  const out = resolve(DATA_SRC, filename)
  if (existsSync(out)) return readFileSync(out, 'utf8')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下载失败 ${res.status} ${res.statusText}：${url}`)
  const text = await res.text()
  mkdirSync(DATA_SRC, { recursive: true })
  writeFileSync(out, text, 'utf8')
  return text
}

/**
 * 汉字字频表。
 * @returns {{ rankOf: Map<string, number>, ordered: string[] }}
 *   rankOf: 汉字 -> 频率排名（1 = 最常用）；ordered: 按频率从高到低排列的汉字数组
 */
export async function ensureCharFrequency() {
  const csv = (await download(CHAR_FREQ_URL, 'hanzi_db.csv')).replace(/^\uFEFF/, '')
  const rankOf = new Map()
  const ordered = []
  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line) continue
    const parts = line.split(',')
    const rank = Number(parts[0])
    const char = parts[1]
    if (!Number.isFinite(rank) || !char) continue
    if (rankOf.has(char)) continue
    rankOf.set(char, rank)
    ordered.push(char)
  }
  return { rankOf, ordered }
}
