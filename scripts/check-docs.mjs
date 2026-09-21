/**
 * 文档写法自检：禁止自述式、口语化与夸张表述。
 *
 * 检查范围只包括正文：围栏代码块、行内代码与 HTML 注释不参与检查，
 * 因为要举反例就得能把这些词写出来。确实需要保留某一行时，
 * 在该行加 `docs-lint: allow`。
 *
 * 同时被 `tests/docs.test.mjs` 引用，所以规则表放在这里而不是测试里。
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** 顶层文档。`docs/` 目录下所有 `.md` 会递归收集。 */
const TOP_LEVEL = ['README.md', 'CONTRIBUTING.md']

/**
 * 规则表。
 * `pattern` 必须带 `g` 标志（命中循环依赖它）；`hint` 说明怎么改。
 */
export const RULES = [
  {
    name: '第一人称',
    pattern: /我们|咱们|笔者|我(?=自己|认为|觉得|建议|想|来|把|在|用|会)/g,
    hint: '改用主语中立的说法：「编码器输出」「测试里的期望值」',
  },
  {
    name: '破折号',
    pattern: /——/g,
    hint: '改用冒号、逗号或句号',
  },
  {
    name: '口语化用词',
    pattern: /踩坑|踩了|顺手|居然|竟然|其实|说白了|搞定|折腾/g,
    hint: '换成「问题」「记录」「同时」「因此」',
  },
  {
    name: '套话过渡',
    pattern: /值得注意的是|需要注意的是|需要指出的是|综上所述|总的来说|不难发现|可以看出/g,
    hint: '删掉过渡语，直接写结论',
  },
  {
    name: '夸张表述',
    pattern: /值得一提|毋庸置疑|显而易见|完美|强大|无缝|赋能|助力|打造|极大地|一站式|开箱即用/g,
    hint: '删掉宣传性修饰，只留事实',
  },
]

export const ALLOW_MARKER = 'docs-lint: allow'

/** 去掉行内代码与 HTML 注释，只留正文。 */
function proseOf(line) {
  return line.replace(/<!--[\s\S]*?-->/g, '').replace(/`[^`]*`/g, '')
}

/**
 * 检查一段 Markdown 文本。
 * @returns {{ line: number, rule: string, text: string, hint: string }[]}
 */
export function lintText(text) {
  const violations = []
  const lines = String(text).split(/\r?\n/)
  let inFence = false

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (/^\s*(?:```|~~~)/.test(raw)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (raw.includes(ALLOW_MARKER)) continue

    const prose = proseOf(raw)
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0
      let match
      while ((match = rule.pattern.exec(prose)) !== null) {
        violations.push({
          line: i + 1,
          rule: rule.name,
          text: match[0],
          hint: rule.hint,
        })
      }
    }
  }

  return violations
}

/** 收集仓库里的所有 Markdown 文档（绝对路径）。 */
export function docFiles(root = ROOT) {
  const files = []

  for (const name of TOP_LEVEL) {
    const path = join(root, name)
    if (existsSync(path)) files.push(path)
  }

  const docsDir = join(root, 'docs')
  if (existsSync(docsDir)) walk(docsDir, files)

  return files
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      walk(path, out)
    } else if (name.toLowerCase().endsWith('.md')) {
      out.push(path)
    }
  }
}

/** 检查整个仓库的文档，返回带文件名的违规列表。 */
export function lintDocs(root = ROOT) {
  const found = []
  for (const file of docFiles(root)) {
    const rel = relative(root, file).split(sep).join('/')
    for (const item of lintText(readFileSync(file, 'utf8'))) {
      found.push({ file: rel, ...item })
    }
  }
  return found
}

function main() {
  const files = docFiles()
  const violations = lintDocs()

  if (violations.length === 0) {
    console.log(`文档写法自检通过：${files.length} 个文件`)
    return
  }

  console.error(`文档写法自检失败：${violations.length} 处`)
  console.error('')
  for (const v of violations) {
    console.error(`${v.file}:${v.line}  [${v.rule}] ${v.text}`)
    console.error(`    ${v.hint}`)
  }
  console.error('')
  console.error(`确实需要保留时，在该行加 ${ALLOW_MARKER}。`)
  process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
