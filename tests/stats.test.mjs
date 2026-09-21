/**
 * 统计层测试。
 * StatsTracker 的所有时间参数都显式传入，所以测试是确定性的，不依赖真实时钟。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { slowestKeys, StatsTracker, topEntries } from '../src/core/stats.ts'

test('StatsTracker：基本计数、错误归属、反应时间', () => {
  const tracker = new StatsTracker()
  tracker.reset()
  tracker.markQuestion(1000)

  // 第一个键：反应时间从题面显示算起 = 400ms
  tracker.hit('KeyA', 1400)
  // 按错：记到「按错的键」和「当前的字」上
  tracker.miss('KeyB', '陈', 1500)
  // 本题按错过，所以独立完成不增加、连击归零
  tracker.complete(true, { now: 1600 })

  const s = tracker.snapshot(2000)
  assert.equal(s.keystrokes, 2)
  assert.equal(s.errors, 1)
  assert.equal(s.done, 1)
  assert.equal(s.independent, 0)
  assert.equal(s.hinted, 0)
  assert.equal(s.combo, 0)
  assert.equal(s.maxCombo, 0)
  assert.deepEqual(s.keyErrors, { KeyB: 1 })
  assert.deepEqual(s.charErrors, { 陈: 1 })
  assert.equal(s.keyTimes.KeyA.total, 400)
  assert.equal(s.keyTimes.KeyA.count, 1)
  assert.equal(s.keyTimes.KeyB.total, 100)
  assert.equal(s.keyAccuracy, 0.5)
  assert.equal(s.independentRate, 0)
  // startedAt = 第一次击键 1400，最后击键 1600，无发呆 -> 2000-1400 = 600
  assert.equal(s.elapsedMs, 600)
})

test('StatsTracker：连续正确完成的连击与速度', () => {
  const tracker = new StatsTracker()
  tracker.reset()

  tracker.markQuestion(0)
  tracker.hit('KeyA', 1000)
  tracker.hit('KeyW', 1500)
  tracker.complete(false, { now: 1600 })

  // 新题面：第一击的反应时间从题面显示算起
  tracker.markQuestion(1700)
  tracker.hit('KeyB', 2000)
  tracker.hit('KeyO', 2300)
  tracker.complete(false, { now: 2400 })

  const s = tracker.snapshot(2400)
  assert.equal(s.done, 2)
  assert.equal(s.independent, 2)
  assert.equal(s.hinted, 0)
  assert.equal(s.combo, 2)
  assert.equal(s.maxCombo, 2)
  assert.equal(s.errors, 0)
  assert.equal(s.independentRate, 1)
  assert.equal(s.hintedRate, 0)
  assert.equal(s.keyAccuracy, 1)
  assert.equal(s.keyTimes.KeyA.total, 1000)
  assert.equal(s.keyTimes.KeyW.total, 500)
  // 第二题第一个键：从题面 1700 到击键 2000 = 300ms（不是与上一次击键的间隔）
  assert.equal(s.keyTimes.KeyB.total, 300)
  assert.equal(s.keyTimes.KeyO.total, 300)
  // 用时 2400-1000 = 1400ms，2 题 -> 2 / (1.4/60) ≈ 85.7 字/分
  assert.equal(s.elapsedMs, 1400)
  assert.ok(Math.abs(s.cpm - 85.71) < 0.1, `cpm 应约 85.7，实际 ${s.cpm}`)
})

test('StatsTracker：发呆时间不计入用时（避免挂机刷低速度）', () => {
  const tracker = new StatsTracker()
  tracker.reset()
  tracker.markQuestion(0)
  tracker.hit('KeyA', 100)
  tracker.hit('KeyB', 200)
  tracker.complete(false, { now: 300 })

  // 发呆 30 秒后再练一题
  const idleStart = 300
  const idleGap = 30000
  tracker.markQuestion(idleStart + idleGap)
  tracker.hit('KeyC', idleStart + idleGap + 200)
  tracker.hit('KeyD', idleStart + idleGap + 400)
  tracker.complete(false, { now: idleStart + idleGap + 500 })

  const s = tracker.snapshot(idleStart + idleGap + 500)
  // 真实跨度是 30.8 秒；发呆扣除后应当只剩「实际操作时间 + 5 秒发呆宽限」
  assert.ok(s.elapsedMs < 6000, `发呆时间应被扣除，实际用时 ${s.elapsedMs}ms`)
  assert.ok(s.elapsedMs > 4000, `发呆宽限内的 5 秒应保留，实际用时 ${s.elapsedMs}ms`)
  assert.equal(s.done, 2)
})

test('StatsTracker：反应时间超过 3 秒按 3 秒计（防止发呆污染「反应慢」榜单）', () => {
  const tracker = new StatsTracker()
  tracker.reset()
  tracker.markQuestion(0)
  tracker.hit('KeyA', 10000)
  const s = tracker.snapshot(10000)
  assert.equal(s.keyTimes.KeyA.total, 3000)
})

test('StatsTracker：靠提示完成的题不计入独立正确率，也不续连击', () => {
  const tracker = new StatsTracker()
  tracker.reset()

  // 第 1 题：独立完成
  tracker.markQuestion(0)
  tracker.hit('KeyA', 100)
  tracker.hit('KeyW', 200)
  tracker.complete(false, { now: 200 })

  // 第 2 题：卡住了，靠自动闪键位提示完成（没按错，但不算独立）
  tracker.markQuestion(200)
  tracker.hit('KeyB', 3500)
  tracker.hit('KeyO', 3700)
  tracker.complete(false, { hinted: true, now: 3700 })

  // 第 3 题：又独立完成
  tracker.markQuestion(3700)
  tracker.hit('KeyC', 3900)
  tracker.hit('KeyX', 4000)
  tracker.complete(false, { now: 4000 })

  const s = tracker.snapshot(4000)
  assert.equal(s.done, 3)
  assert.equal(s.independent, 2, '提示过的那题不算独立')
  assert.equal(s.hinted, 1)
  assert.ok(Math.abs(s.independentRate - 2 / 3) < 1e-9, `独立正确率应为 2/3，实际 ${s.independentRate}`)
  assert.ok(Math.abs(s.hintedRate - 1 / 3) < 1e-9)
  assert.equal(s.errors, 0, '提示不等于按错')
  assert.equal(s.keyAccuracy, 1, '按键正确率不受提示影响')
  assert.equal(s.combo, 1, '提示会打断连击')
  assert.equal(s.maxCombo, 1)
  // 速度按「打对的题数」算，提示题也算（它会自然拖慢速度，不需要额外惩罚）
  assert.equal(s.cpm, 3 / (s.elapsedMs / 60000))
  assert.ok(s.cpm > 0)
})

test('StatsTracker：又按错又用提示的题，两边都不占', () => {
  const tracker = new StatsTracker()
  tracker.reset()
  tracker.markQuestion(0)
  tracker.hit('KeyA', 100)
  tracker.miss('KeyB', '陈', 200)
  tracker.hit('KeyW', 300)
  tracker.hit('KeyO', 400)
  tracker.complete(true, { hinted: true, now: 400 })

  const s = tracker.snapshot(400)
  assert.equal(s.done, 1)
  assert.equal(s.independent, 0)
  assert.equal(s.hinted, 1)
  assert.equal(s.independentRate, 0)
  assert.equal(s.hintedRate, 1)
})

test('StatsTracker：shift 把暂停时长记为发呆（不计入用时），且不污染反应时间', () => {
  const tracker = new StatsTracker()
  tracker.reset()
  tracker.markQuestion(0)
  tracker.hit('KeyA', 100)
  tracker.hit('KeyB', 200)
  tracker.complete(false, { now: 300 })

  // 暂停 5 分钟
  const paused = 300000
  tracker.shift(paused, 300 + paused)

  // 恢复后第一击：反应时间应该从恢复时刻算起，而不是「暂停了 5 分钟」
  tracker.markQuestion(300 + paused)
  tracker.hit('KeyC', 300 + paused + 250)
  tracker.hit('KeyD', 300 + paused + 450)
  tracker.complete(false, { now: 300 + paused + 500 })

  const s = tracker.snapshot(300 + paused + 500)
  assert.equal(s.keyTimes.KeyC.total, 250, '恢复后的反应时间不应包含暂停时长')
  assert.equal(s.keyTimes.KeyD.total, 200)
  // 有效用时里不该出现那 5 分钟
  assert.ok(s.elapsedMs < 2000, `暂停时长应被扣除，实际 ${s.elapsedMs}ms`)
  assert.equal(s.done, 2)
})

test('StatsTracker：shift 传 0 或负数时不改变状态', () => {
  const tracker = new StatsTracker()
  tracker.reset()
  tracker.markQuestion(0)
  tracker.hit('KeyA', 100)
  tracker.shift(0, 500)
  tracker.shift(-100, 600)
  const s = tracker.snapshot(700)
  assert.equal(s.keyTimes.KeyA.total, 100)
  // 起点仍是第一次击键的 100；shift 只把「上次击键」基准推后，所以用时 = 700 - 100
  assert.equal(s.elapsedMs, 600)
})

test('topEntries：按次数取前 N 名，次数相同按 key 稳定排序', () => {
  const map = { KeyA: 3, KeyB: 5, KeyC: 1, KeyD: 5 }
  assert.deepEqual(topEntries(map, 2), [
    { key: 'KeyB', count: 5 },
    { key: 'KeyD', count: 5 },
  ])
  assert.deepEqual(topEntries({}, 10), [])
  assert.equal(topEntries(map, 10).length, 4)
})

test('slowestKeys：按平均反应时间排序，并能过滤样本太少的键', () => {
  const keyTimes = {
    KeyA: { total: 600, count: 2 }, // 300ms
    KeyB: { total: 400, count: 1 }, // 400ms 但只按过 1 次
    KeyC: { total: 2400, count: 4 }, // 600ms
  }
  const withMin2 = slowestKeys(keyTimes, 10, 2)
  assert.deepEqual(withMin2.map((k) => k.key), ['KeyC', 'KeyA'])
  assert.equal(withMin2[0].avgMs, 600)

  const withMin1 = slowestKeys(keyTimes, 10, 1)
  assert.deepEqual(withMin1.map((k) => k.key), ['KeyC', 'KeyB', 'KeyA'])
})

test('StatsTracker：reset 后一切归零，且未击键时用时为 0', () => {
  const tracker = new StatsTracker()
  tracker.reset()
  tracker.markQuestion(0)
  tracker.hit('KeyA', 500)
  tracker.miss('KeyB', 'x', 600)
  tracker.complete(true, { now: 700 })

  tracker.reset()
  const s = tracker.snapshot(99999)
  assert.equal(s.done, 0)
  assert.equal(s.independent, 0)
  assert.equal(s.hinted, 0)
  assert.equal(s.keystrokes, 0)
  assert.equal(s.errors, 0)
  assert.deepEqual(s.keyErrors, {})
  assert.deepEqual(s.charErrors, {})
  assert.deepEqual(s.keyTimes, {})
  assert.equal(s.elapsedMs, 0, '还没击键就不应该开始计时')
})
