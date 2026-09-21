/**
 * 下载小鹤官方码表，用于**独立交叉验证**本项目的双拼编码器。
 *
 * 数据源：ITX-Snowhare/flypy-codetable（记录各版本小鹤双拼所附带的码表）
 * 其中「系统词库」是小鹤音形的主码表：每行「词/字 + 编码」，
 * 编码的前两位就是**双拼部分**（后面是形码），所以可以逐字反查官方双拼码。
 *
 * 运行：node scripts/fetch-flypy-table.mjs
 * 产物：data-src/flypy-main.txt（已 gitignore，可随时重新下载）
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'data-src/flypy-main.txt')
const URL =
  'https://raw.githubusercontent.com/ITX-Snowhare/flypy-codetable/master/' +
  encodeURIComponent('导出码表') +
  '/' +
  encodeURIComponent('导出 - 主码 -  系统词库.txt')

export async function ensureFlypyTable() {
  if (existsSync(OUT)) return readFileSync(OUT, 'utf8')
  const res = await fetch(URL)
  if (!res.ok) throw new Error(`下载失败：${res.status} ${res.statusText}`)
  const text = await res.text()
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, text, 'utf8')
  return text
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('fetch-flypy-table.mjs')) {
  const text = await ensureFlypyTable()
  const lines = text.split(/\r?\n/).filter(Boolean)
  console.log(`✅ 码表行数：${lines.length}`)
  console.log('前 5 行（原样）：')
  console.log(lines.slice(0, 5).map((l) => '   ' + JSON.stringify(l)).join('\n'))
  const probe = ['也', '王', '陈', '啊', '女', '略', '中', '是', '吃', '云', '元', '月', '我', '用', '鱼']
  console.log('抽样查字：')
  for (const ch of probe) {
    const hit = lines.find((l) => l.startsWith(ch + '\t') || l.startsWith(ch + ' '))
    console.log(`   ${ch} -> ${hit ? JSON.stringify(hit.split(/[\t ]+/)[1]) : '(未找到)'}`)
  }
}
