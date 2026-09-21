/**
 * 小鹤双拼（Flypy）键位表与编码器。
 *
 * 数据来源：小鹤双拼官方键位图，并与参考产品（双拼练习 v6）截图逐键核对。
 * 本模块是**纯函数模块**：不依赖 DOM / Vue / pinyin-pro，可直接在 Node 里跑单测
 * （见 tests/encode.test.mjs，对全部音节做全量回归）。
 *
 * ── 编码规则（小鹤双拼）─────────────────────────────────────────
 * 1. 声母：单字母声母用本键；zh/ch/sh 分别用 V/I/U 键。
 * 2. 韵母：查下表；ü 一律写作 v（女 nü -> nv），üe 写作 ve（略 lüe -> lt）。
 * 3. y / w 视作普通声母：要 yao -> y+c、王 wang -> w+l、云 yun -> y+y。
 * 4. 零声母（没有 y/w 的 a、e、o 系音节）走 ZERO_INITIAL 表：
 *    a->aa  e->ee  o->oo（单韵母重复）
 *    ai/an/ao/ei/en/er/ou 打全拼本身
 *    ang->ah  eng->eg（三字母鼻韵母用「首字母 + 韵母键」）
 * ─────────────────────────────────────────────────────────────
 */

import type { Encoded, KeyDef, Scheme, ZeroInitialEntry } from './types.ts'

/** 键位图三行（顺序即渲染顺序），与官方键位图一致 */
export const KEY_ROWS: readonly (readonly KeyDef[])[] = [
  [
    { code: 'KeyQ', letter: 'Q', initials: [], finals: ['iu'] },
    { code: 'KeyW', letter: 'W', initials: [], finals: ['ei'] },
    { code: 'KeyE', letter: 'E', initials: [], finals: ['e'] },
    { code: 'KeyR', letter: 'R', initials: [], finals: ['uan'] },
    { code: 'KeyT', letter: 'T', initials: [], finals: ['ue', 've'] },
    { code: 'KeyY', letter: 'Y', initials: [], finals: ['un'] },
    { code: 'KeyU', letter: 'U', initials: ['sh'], finals: ['u'] },
    { code: 'KeyI', letter: 'I', initials: ['ch'], finals: ['i'] },
    { code: 'KeyO', letter: 'O', initials: [], finals: ['o', 'uo'] },
    { code: 'KeyP', letter: 'P', initials: [], finals: ['ie'] },
  ],
  [
    { code: 'KeyA', letter: 'A', initials: [], finals: ['a'] },
    { code: 'KeyS', letter: 'S', initials: [], finals: ['iong', 'ong'] },
    { code: 'KeyD', letter: 'D', initials: [], finals: ['ai'] },
    { code: 'KeyF', letter: 'F', initials: [], finals: ['en'] },
    { code: 'KeyG', letter: 'G', initials: [], finals: ['eng'] },
    { code: 'KeyH', letter: 'H', initials: [], finals: ['ang'] },
    { code: 'KeyJ', letter: 'J', initials: [], finals: ['an'] },
    { code: 'KeyK', letter: 'K', initials: [], finals: ['ing', 'uai'] },
    { code: 'KeyL', letter: 'L', initials: [], finals: ['iang', 'uang'] },
    { code: 'Semicolon', letter: ';', initials: [], finals: [] },
  ],
  [
    { code: 'KeyZ', letter: 'Z', initials: [], finals: ['ou'] },
    { code: 'KeyX', letter: 'X', initials: [], finals: ['ia', 'ua'] },
    { code: 'KeyC', letter: 'C', initials: [], finals: ['ao'] },
    { code: 'KeyV', letter: 'V', initials: ['zh'], finals: ['ui', 'v'] },
    { code: 'KeyB', letter: 'B', initials: [], finals: ['in'] },
    { code: 'KeyN', letter: 'N', initials: [], finals: ['iao'] },
    { code: 'KeyM', letter: 'M', initials: [], finals: ['ian'] },
  ],
]

/** 零声母音节表（展示顺序即下表顺序） */
export const ZERO_INITIAL: readonly ZeroInitialEntry[] = [
  { syllable: 'a', code: 'aa' },
  { syllable: 'ai', code: 'ai' },
  { syllable: 'an', code: 'an' },
  { syllable: 'ang', code: 'ah' },
  { syllable: 'ao', code: 'ao' },
  { syllable: 'e', code: 'ee' },
  { syllable: 'ei', code: 'ei' },
  { syllable: 'en', code: 'en' },
  { syllable: 'eng', code: 'eg' },
  { syllable: 'er', code: 'er' },
  { syllable: 'o', code: 'oo' },
  { syllable: 'ou', code: 'ou' },
]

/** 合法声母（按长度优先用于最大匹配；不含 a/e/o 等零声母起始字母） */
export const INITIALS: readonly string[] = [
  'zh', 'ch', 'sh',
  'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h',
  'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w',
]

/** 所有按键（拍平三行） */
export const ALL_KEYS: readonly KeyDef[] = KEY_ROWS.flat()

/** 字母 -> 键码（用于零声母表的字母编码） */
const LETTER_TO_CODE = new Map<string, string>()
/** 键码 -> 键位定义 */
const CODE_TO_KEY = new Map<string, KeyDef>()
for (const key of ALL_KEYS) {
  CODE_TO_KEY.set(key.code, key)
  if (key.letter !== ';') LETTER_TO_CODE.set(key.letter.toLowerCase(), key.code)
}

/** 声母 -> 键码 */
const INITIAL_TO_CODE = new Map<string, string>()
for (const initial of INITIALS) {
  // zh/ch/sh 用 V/I/U，其余单字母声母用本键
  const owning = ALL_KEYS.find((k) => k.initials.includes(initial))
  const code = owning ? owning.code : LETTER_TO_CODE.get(initial)
  if (code) INITIAL_TO_CODE.set(initial, code)
}

/** 韵母 -> 键码 */
const FINAL_TO_CODE = new Map<string, string>()
for (const key of ALL_KEYS) {
  for (const final of key.finals) FINAL_TO_CODE.set(final, key.code)
}

const ZERO_INITIAL_MAP = new Map(ZERO_INITIAL.map((z) => [z.syllable, z]))

/** ü 及其带调形式统一成 v，再去掉声调符号 */
const U_UMLAUT = /[üǖǘǚǜ]/g
const COMBINING_MARKS = /[\u0300-\u036f]/g

/**
 * 规范化音节：转小写、ü -> v、去声调符号、剔除字母以外的字符。
 * 注意顺序：必须先转小写再替换 ü（否则大写 Ü 会漏），
 * 且必须在 NFD 分解之前替换（分解后 ü 变成 u + 组合分音符，就认不出来了）。
 */
export function normalizeSyllable(raw: string): string {
  return raw
    .toLowerCase()
    .replace(U_UMLAUT, 'v')
    .replace(/u:/g, 'v')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-z]/g, '')
}

/** 根据键码取键帽字母 */
export function letterOfCode(code: string): string {
  return CODE_TO_KEY.get(code)?.letter.toLowerCase() ?? ''
}

/** 根据键码取键位定义 */
export function keyOfCode(code: string): KeyDef | undefined {
  return CODE_TO_KEY.get(code)
}

/** 根据字母取键码 */
export function codeOfLetter(letter: string): string | undefined {
  return LETTER_TO_CODE.get(letter.toLowerCase())
}

/** 根据字母取键位定义 */
export function keyOfLetter(letter: string): KeyDef | undefined {
  const code = codeOfLetter(letter)
  return code ? CODE_TO_KEY.get(code) : undefined
}

/**
 * 某个键能作为「声母键」承载的全部声母。
 * 单字母声母（b p m f … y w）虽然没写在键位表里，但确实用本键，所以这里补上。
 */
export function initialsOfKey(key: KeyDef): string[] {
  const letter = key.letter.toLowerCase()
  const own = INITIALS.includes(letter) ? [letter] : []
  return [...new Set([...key.initials, ...own])]
}

/**
 * 反向解码：给两个字母，列出所有可能对应的音节。
 * 用于「显示答案（可能不唯一）」和 M4 的键位记忆训练模式。
 * 用「再编码回去必须得到同样的字母」做过滤，保证不会列出无效音节。
 */
export function decodeLetters(letters: string): string[] {
  const text = letters.toLowerCase()
  if (text.length !== 2) return []
  const out = new Set<string>()

  for (const zero of ZERO_INITIAL) {
    if (zero.code === text) out.add(zero.syllable)
  }

  const first = keyOfLetter(text[0])
  const second = keyOfLetter(text[1])
  if (first && second) {
    for (const initial of initialsOfKey(first)) {
      for (const final of second.finals) {
        const syllable = initial + final
        const back = encode(syllable)
        if (back && back.letters.join('') === text) out.add(syllable)
      }
    }
  }
  return [...out]
}

/**
 * 把一个无调音节编码成小鹤双拼的两键。
 * @returns 无法编码时返回 null（例如 n / ng / hm / ê 这类边缘音节）
 */
export function encode(rawSyllable: string): Encoded | null {
  const syllable = normalizeSyllable(rawSyllable)
  if (!syllable) return null

  const zero = ZERO_INITIAL_MAP.get(syllable)
  if (zero) {
    const codes = [codeOfLetter(zero.code[0]), codeOfLetter(zero.code[1])]
    if (!codes[0] || !codes[1]) return null
    return {
      syllable,
      initial: '',
      final: '',
      codes: [codes[0], codes[1]],
      letters: [zero.code[0], zero.code[1]],
      zeroInitial: true,
    }
  }

  const initial = INITIALS.find((i) => syllable.startsWith(i))
  if (!initial) return null // 没有 y/w 又不是零声母表里的音节，小鹤无法编码

  const final = syllable.slice(initial.length)
  const initialCode = INITIAL_TO_CODE.get(initial)
  const finalCode = FINAL_TO_CODE.get(final)
  if (!initialCode || !finalCode) return null

  return {
    syllable,
    initial,
    final,
    codes: [initialCode, finalCode],
    // 注意：zh/ch/sh 要显示成它们所在的键帽字母 v/i/u，而不是 'zh'/'ch'/'sh'
    letters: [letterOfCode(initialCode), letterOfCode(finalCode)],
    zeroInitial: false,
  }
}

export const xiaoheScheme: Scheme = {
  id: 'xiaohe',
  name: '小鹤双拼',
  description: '全部拼音组合 · 声母 + 韵母各一键',
  keyRows: KEY_ROWS,
  zeroInitial: ZERO_INITIAL,
  encode,
}
