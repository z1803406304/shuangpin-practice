/**
 * 卡住自动提示的策略测试。
 *
 * 这些用例覆盖的都是「实际用起来会踩」的边界：
 * 关闭提示、只闪键位（不给答案）、答案阈值比弱提示还早、进度条计算。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { HINT_OFF, hintProgress, isHintEnabled, nextStageDelay, stageForIdle } from '../src/core/hint.ts'

const ONLY_PULSE = { hintAfterMs: 3000, revealAfterMs: 0 } // 默认策略：只闪键位
const TWO_STAGE = { hintAfterMs: 3000, revealAfterMs: 6000 } // 闪键位 -> 再给答案

test('关闭提示时永远不提示，也不排下一个定时器', () => {
  for (const idle of [0, 100, 3000, 60000]) {
    assert.equal(stageForIdle(idle, HINT_OFF), 0)
    assert.equal(nextStageDelay(idle, HINT_OFF), null)
    assert.equal(hintProgress(idle, HINT_OFF), 0)
  }
  assert.equal(isHintEnabled(HINT_OFF), false)
})

test('只闪键位：到点进入 1 级，且永远不会到 2 级', () => {
  assert.equal(stageForIdle(0, ONLY_PULSE), 0)
  assert.equal(stageForIdle(2999, ONLY_PULSE), 0)
  assert.equal(stageForIdle(3000, ONLY_PULSE), 1)
  assert.equal(stageForIdle(3001, ONLY_PULSE), 1)
  assert.equal(stageForIdle(600000, ONLY_PULSE), 1, '没开自动答案就永远停在 1 级')
  assert.equal(nextStageDelay(3000, ONLY_PULSE), null, '到顶后不再排定时器')
  assert.equal(isHintEnabled(ONLY_PULSE), true)
})

test('两段式：先闪键位，再到点给答案', () => {
  assert.equal(stageForIdle(2999, TWO_STAGE), 0)
  assert.equal(stageForIdle(3000, TWO_STAGE), 1)
  assert.equal(stageForIdle(5999, TWO_STAGE), 1)
  assert.equal(stageForIdle(6000, TWO_STAGE), 2)
  assert.equal(stageForIdle(60000, TWO_STAGE), 2)
})

test('nextStageDelay：给出距离下一次升级的真实等待时间', () => {
  assert.equal(nextStageDelay(0, TWO_STAGE), 3000)
  assert.equal(nextStageDelay(1000, TWO_STAGE), 2000)
  assert.equal(nextStageDelay(3000, TWO_STAGE), 3000)
  assert.equal(nextStageDelay(5500, TWO_STAGE), 500)
  assert.equal(nextStageDelay(6000, TWO_STAGE), null)
  assert.equal(nextStageDelay(99999, TWO_STAGE), null)

  // 用返回值推进时间，必须正好落在下一级的阈值上（不能跳级也不能停住）
  let idle = 0
  const visited = []
  for (let i = 0; i < 5; i += 1) {
    const delay = nextStageDelay(idle, TWO_STAGE)
    if (delay === null) break
    idle += delay
    visited.push({ idle, stage: stageForIdle(idle, TWO_STAGE) })
  }
  assert.deepEqual(visited, [
    { idle: 3000, stage: 1 },
    { idle: 6000, stage: 2 },
  ])
})

test('答案阈值比弱提示更早时：直接给答案，跳过闪键位', () => {
  const reversed = { hintAfterMs: 6000, revealAfterMs: 3000 }
  assert.equal(stageForIdle(2999, reversed), 0)
  assert.equal(stageForIdle(3000, reversed), 2, '阈值更早的那一级先生效')
  assert.equal(stageForIdle(60000, reversed), 2)
  assert.equal(nextStageDelay(0, reversed), 3000)
  assert.equal(nextStageDelay(3000, reversed), 3000, '下一个阈值是 6000，但结果已经是 2 级了')
})

test('两个阈值相同时只触发一次', () => {
  const same = { hintAfterMs: 4000, revealAfterMs: 4000 }
  assert.equal(stageForIdle(3999, same), 0)
  assert.equal(stageForIdle(4000, same), 2, '同一时刻应直接到最高级')
  assert.equal(nextStageDelay(0, same), 4000)
  assert.equal(nextStageDelay(4000, same), null)
})

test('只开自动答案（不开弱提示）也能工作', () => {
  const revealOnly = { hintAfterMs: 0, revealAfterMs: 5000 }
  assert.equal(stageForIdle(4999, revealOnly), 0)
  assert.equal(stageForIdle(5000, revealOnly), 2)
  assert.equal(nextStageDelay(0, revealOnly), 5000)
  assert.equal(isHintEnabled(revealOnly), true)
})

test('hintProgress：进度条按第一个阈值填满，之后保持 1', () => {
  assert.equal(hintProgress(0, TWO_STAGE), 0)
  assert.equal(hintProgress(1500, TWO_STAGE), 0.5)
  assert.equal(hintProgress(3000, TWO_STAGE), 1)
  assert.equal(hintProgress(5000, TWO_STAGE), 1)
  assert.equal(hintProgress(-100, TWO_STAGE), 0)
  // 只开答案时，进度条按答案阈值走
  assert.equal(hintProgress(2500, { hintAfterMs: 0, revealAfterMs: 5000 }), 0.5)
})
