/**
 * 小鹤双拼编码器全量回归测试。
 * 运行：npm test（即 node --test tests/，Node 24 原生支持直接跑 TS 源码）
 *
 * 三种测试：
 * 1. 权威用例表：手写核对过的映射，锚定「编码规则不能被改错」。
 * 2. 全量音节：字典里出现的每一个音节都必须能编码，且编码唯一、稳定、键位合法。
 * 3. 一致性：SYLLABLES 数据文件与实时编码结果必须一致（防止数据文件过期）。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { encode, normalizeSyllable, ALL_KEYS, ZERO_INITIAL } from '../src/core/schemes/xiaohe.ts'
import { SYLLABLES, SYLLABLE_COUNT } from '../src/data/syllables.ts'

const VALID_CODES = new Set(ALL_KEYS.map((k) => k.code))

/**
 * 权威用例：{ 音节: 应该敲的两个字母 }
 * 覆盖了声母、每一条韵母、zh/ch/sh、y/w 系、ü 系、零声母全部 12 种。
 */
const CASES = {
  // 零声母（全 12 条）
  a: 'aa', ai: 'ai', an: 'an', ang: 'ah', ao: 'ao', e: 'ee', ei: 'ei',
  en: 'en', eng: 'eg', er: 'er', o: 'oo', ou: 'ou',
  // 截图里的题面用例：陈 = ch + en
  chen: 'if',
  // zh / ch / sh
  zhi: 'vi', chi: 'ii', shi: 'ui', zhong: 'vs', zhang: 'vh', shu: 'uu',
  che: 'ie', ri: 'ri', zi: 'zi', ci: 'ci', si: 'si',
  // y / w 视作普通声母（已用官方小鹤码表交叉验证：也=ye、王=wh、略=lt、鱼=yu）
  yao: 'yc', wang: 'wh', yun: 'yy', yuan: 'yr', yue: 'yt', wo: 'wo',
  wei: 'ww', wu: 'wu', wen: 'wf', wai: 'wd', yin: 'yb', ying: 'yk',
  you: 'yz', yan: 'yj', yong: 'ys', yu: 'yu', ya: 'ya', ye: 'ye',
  yang: 'yh', wa: 'wa', wan: 'wj', weng: 'wg',
  // ü 系：nü/lü 写 v，nüe/lüe 写 ve -> T 键；j/q/x/y 后的 ü 写 u
  nv: 'nv', lv: 'lv', nve: 'nt', lve: 'lt', ju: 'ju', jue: 'jt',
  jun: 'jy', qu: 'qu', xu: 'xu', yu: 'yu', juan: 'jr', xue: 'xt',
  // 声母 + 各韵母
  guan: 'gr', guang: 'gl', niu: 'nq', liu: 'lq', duo: 'do', xie: 'xp',
  xiao: 'xn', tian: 'tm', xiang: 'xl', kuai: 'kk', qing: 'qk', xin: 'xb',
  men: 'mf', feng: 'fg', fang: 'fh', kan: 'kj', lai: 'ld', zou: 'zz',
  xia: 'xx', hua: 'hx', hao: 'hc', zhui: 'vv', mai: 'md', qiong: 'qs',
  hui: 'hv', gun: 'gy', qun: 'qy', bin: 'bb', bing: 'bk', bie: 'bp',
  niang: 'nl', jiang: 'jl', kou: 'kz', gei: 'gw', nei: 'nw', pen: 'pf',
  seng: 'sg', zang: 'zh', cou: 'cz', jia: 'jx', gua: 'gx', lve: 'lt',
}

test('权威用例表：逐条核对小鹤双拼编码', () => {
  const failures = []
  for (const [syllable, expected] of Object.entries(CASES)) {
    const got = encode(syllable)
    if (!got) {
      failures.push(`${syllable}: 无法编码，期望 ${expected}`)
      continue
    }
    const actual = got.letters.join('')
    if (actual !== expected) failures.push(`${syllable}: 得到 ${actual}，期望 ${expected}`)
  }
  assert.deepEqual(failures, [], `\n${failures.join('\n')}\n`)
})

test('零声母表：12 条全部可编码且与表一致', () => {
  for (const entry of ZERO_INITIAL) {
    const got = encode(entry.syllable)
    assert.ok(got, `${entry.syllable} 应可编码`)
    assert.equal(got.zeroInitial, true, `${entry.syllable} 应识别为零声母`)
    assert.equal(got.letters.join(''), entry.code, `${entry.syllable} 编码应为 ${entry.code}`)
  }
  assert.equal(ZERO_INITIAL.length, 12)
})

test('全量音节：字典里出现的每个音节都能编码，且编码合法、稳定、唯一', () => {
  assert.ok(SYLLABLE_COUNT > 380, `音节数偏少：${SYLLABLE_COUNT}`)
  assert.equal(SYLLABLES.length, SYLLABLE_COUNT)
  assert.equal(new Set(SYLLABLES.map((s) => s.s)).size, SYLLABLES.length, '音节表存在重复')

  const problems = []
  for (const row of SYLLABLES) {
    const got = encode(row.s)
    if (!got) {
      problems.push(`${row.s}: 无法编码`)
      continue
    }
    if (got.codes.length !== 2) problems.push(`${row.s}: 键数不是 2`)
    for (const code of got.codes) {
      if (!VALID_CODES.has(code)) problems.push(`${row.s}: 非法键码 ${code}`)
    }
    if (got.letters.join('') !== row.code) {
      problems.push(`${row.s}: 数据文件 code=${row.code}，实时编码=${got.letters.join('')}`)
    }
    // 稳定性：重复调用结果一致
    assert.deepEqual(encode(row.s).letters, got.letters, `${row.s} 编码不稳定`)
    // 规范化：加声调后编码不变
    assert.deepEqual(encode(row.s).codes, got.codes)
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}\n`)
})

test('每个合法键位都被某个韵母或声母使用（或明确留空）', () => {
  const used = new Set()
  for (const row of SYLLABLES) {
    for (const code of encode(row.s).codes) used.add(code)
  }
  // 只有分号键不参与编码
  const unused = [...VALID_CODES].filter((c) => !used.has(c) && c !== 'Semicolon')
  assert.deepEqual(unused, [], `未被任何音节使用的键：${unused.join(', ')}`)
})

test('normalizeSyllable：处理声调符号、ü、大写、u: 写法', () => {
  assert.equal(normalizeSyllable('chén'), 'chen')
  assert.equal(normalizeSyllable('nǚ'), 'nv')
  assert.equal(normalizeSyllable('LÜE'), 'lve')
  assert.equal(normalizeSyllable('nu:'), 'nv')
  assert.equal(normalizeSyllable('  Chen  '), 'chen')
  assert.equal(normalizeSyllable('ér'), 'er')
})

test('无法编码的边缘音节返回 null，而不是抛错或给出错误码', () => {
  for (const bad of ['n', 'ng', 'hm', 'hng', '', 'xyz', '123']) {
    assert.equal(encode(bad), null, `${bad} 应返回 null`)
  }
})
