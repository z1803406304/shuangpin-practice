/**
 * 题面文本处理的测试。
 * 重点是 alignDisplay：句子题面带标点，而输入只针对汉字，
 * 对错位就会出现「丢字」或「标点被当成一个待输入的字」。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { alignDisplay, capitalize, countHanzi, displayFinal, shortLabel, splitSyllables } from '../src/core/text.ts'

test('splitSyllables：按空白切分，容忍多余空格', () => {
  assert.deepEqual(splitSyllables('xue xi'), ['xue', 'xi'])
  assert.deepEqual(splitSyllables('  jin   tian  '), ['jin', 'tian'])
  assert.deepEqual(splitSyllables(''), [])
  assert.deepEqual(splitSyllables(null), [])
  assert.deepEqual(splitSyllables(undefined), [])
})

test('alignDisplay：标点挂到相邻汉字上，不占音节', () => {
  const parts = alignDisplay('今天很好。', ['jin', 'tian', 'hen', 'hao'])
  assert.equal(parts.length, 4)
  assert.deepEqual(parts.map((p) => p.char), ['今', '天', '很', '好'])
  assert.deepEqual(parts.map((p) => p.syllable), ['jin', 'tian', 'hen', 'hao'])
  assert.equal(parts[3].tail, '。')
  assert.deepEqual(parts.map((p) => p.lead), ['', '', '', ''])
})

test('alignDisplay：句中标点不会让后续音节错位（这是真踩过的 bug）', () => {
  // 「今天天气很好，我们出去走走。」——逗号曾经被当成一个待输入的字，
  // 导致后面每个字的音节都错位、甚至整字丢失
  const text = '今天天气很好，我们出去走走。'
  const syllables = ['jin', 'tian', 'tian', 'qi', 'hen', 'hao', 'wo', 'men', 'chu', 'qu', 'zou', 'zou']
  const parts = alignDisplay(text, syllables)
  assert.equal(parts.length, 12)
  assert.equal(parts.map((p) => p.char).join(''), '今天天气很好我们出去走走')
  assert.deepEqual(parts.map((p) => p.syllable), syllables)
  assert.equal(parts[5].char, '好')
  assert.equal(parts[5].tail, '，')
  assert.equal(parts[6].char, '我')
  assert.equal(parts[11].tail, '。')
})

test('alignDisplay：开头的标点挂到第一个字上，末尾连续标点全部保留', () => {
  const parts = alignDisplay('「你好！」', ['ni', 'hao'])
  assert.equal(parts.length, 2)
  assert.equal(parts[0].lead, '「')
  assert.equal(parts[0].char, '你')
  assert.equal(parts[1].char, '好')
  assert.equal(parts[1].tail, '！」')
})

test('alignDisplay：没有汉字时返回单条占位，不抛异常', () => {
  const parts = alignDisplay('。。。', [])
  assert.equal(parts.length, 1)
  assert.equal(parts[0].char, '')
  assert.equal(parts[0].lead, '。。。')
  assert.deepEqual(alignDisplay('', []), [])
})

test('alignDisplay：音节不够时留空串，不崩', () => {
  const parts = alignDisplay('你好', ['ni'])
  assert.equal(parts.length, 2)
  assert.equal(parts[1].syllable, '')
})

test('countHanzi：只数汉字', () => {
  assert.equal(countHanzi('今天天气很好'), 6)
  assert.equal(countHanzi('今天，很好。'), 4)
  assert.equal(countHanzi('abc123'), 0)
  assert.equal(countHanzi(''), 0)
})

test('capitalize / displayFinal / shortLabel', () => {
  assert.equal(capitalize('chen'), 'Chen')
  assert.equal(capitalize(''), '')
  assert.equal(displayFinal('ve'), 'üe')
  assert.equal(displayFinal('v'), 'ü')
  assert.equal(displayFinal('uang'), 'uang')
  assert.equal(shortLabel('今天天气很好'), '今天天气很好')
  // 正好 12 个字不截断，13 个才截断
  assert.equal(shortLabel('今天天气很好我们出去走走'), '今天天气很好我们出去走走')
  assert.equal(shortLabel('今天天气很好我们出去走走吧'), '今天天气很好我们出去走走…')
  assert.equal(shortLabel('  多   空格  '), '多 空格')
})
