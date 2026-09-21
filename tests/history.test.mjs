/**
 * 历史记录纯逻辑测试：构建、汇总、序列化与**坏数据容错**。
 *
 * 坏数据容错是重点：历史存在 localStorage 里，可能被手改、可能是旧版本、
 * 也可能写到一半断电。这些情况下宁可丢几条记录，也不能让页面白屏。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  aggregateCharErrors,
  aggregateKeyErrors,
  buildSessionRecord,
  exportHistory,
  formatDuration,
  formatTime,
  HISTORY_LIMIT,
  isWorthSaving,
  mergeRecords,
  MIN_QUESTIONS_TO_SAVE,
  parseActive,
  parseHistory,
  parseRecord,
  pushRecord,
  serializeActive,
  serializeHistory,
  summarize,
} from '../src/core/history.ts'
import { StatsTracker } from '../src/core/stats.ts'

/**
 * 造一个统计快照。
 * 注意 elapsedMs 是**直接给定**的：真实计时逻辑由 stats.test.mjs 覆盖，
 * 这里只需要一个形状正确的快照来测「快照 -> 历史记录」的转换。
 */
function makeSnapshot(done, independent, errors, cpm, elapsedMs = 60000, hinted = 0) {
  const tracker = new StatsTracker()
  tracker.reset()
  tracker.markQuestion(0)
  tracker.hit('KeyA', 0)
  tracker.miss('KeyB', '陈', 100)
  tracker.complete(true, 200)
  const snapshot = tracker.snapshot(200)
  // done/independent/hinted 与对应比率一起给定，保持内部自洽
  return {
    ...snapshot,
    done,
    independent,
    hinted,
    errors,
    cpm,
    elapsedMs,
    independentRate: done > 0 ? independent / done : 1,
    hintedRate: done > 0 ? hinted / done : 0,
  }
}

function makeMeta(overrides = {}) {
  return {
    id: 'round-test',
    startedAt: 1000,
    endedAt: 61000,
    schemeId: 'xiaohe',
    schemeName: '小鹤双拼',
    modeId: 'syllable',
    modeName: '全部拼音组合',
    ...overrides,
  }
}

test('buildSessionRecord：把统计快照和元信息合成一条记录', () => {
  const snapshot = makeSnapshot(20, 18, 3, 60, 60000, 2)
  const record = buildSessionRecord(snapshot, makeMeta())
  assert.equal(record.id, 'round-test')
  assert.equal(record.done, 20)
  assert.equal(record.independent, 18)
  assert.equal(record.hinted, 2)
  assert.equal(record.errors, 3)
  assert.equal(record.cpm, 60)
  assert.equal(record.independentRate, 0.9)
  assert.equal(record.hintedRate, 0.1)
  assert.equal(record.schemeName, '小鹤双拼')
  assert.equal(record.modeName, '全部拼音组合')
  assert.equal(record.elapsedMs, 60000)
  // 内部 map 必须是拷贝，不能和快照共享引用
  assert.notEqual(record.keyErrors, snapshot.keyErrors)
  assert.deepEqual(record.keyErrors, snapshot.keyErrors)
})

test('isWorthSaving：题数太少不入历史（过滤误触）', () => {
  const meta = makeMeta()
  assert.equal(isWorthSaving(buildSessionRecord(makeSnapshot(1, 1, 0, 10), meta)), false)
  assert.equal(isWorthSaving(buildSessionRecord(makeSnapshot(MIN_QUESTIONS_TO_SAVE, 3, 0, 10), meta)), true)
  assert.equal(isWorthSaving(buildSessionRecord(makeSnapshot(50, 50, 0, 90), meta)), true)
})

test('pushRecord：新记录在最前，同 id 覆盖，且不超过上限', () => {
  const base = (id, cpm) => buildSessionRecord(makeSnapshot(10, 10, 0, cpm), makeMeta({ id }))
  let list = []
  list = pushRecord(list, base('a', 10))
  list = pushRecord(list, base('b', 20))
  assert.deepEqual(list.map((r) => r.id), ['b', 'a'])

  // 同 id 再来一次：覆盖而不是重复
  list = pushRecord(list, base('a', 30))
  assert.deepEqual(list.map((r) => r.id), ['a', 'b'])
  assert.equal(list[0].cpm, 30)

  // 上限裁剪：只留最新的 HISTORY_LIMIT 条
  let many = []
  for (let i = 0; i < HISTORY_LIMIT + 25; i += 1) many = pushRecord(many, base(`r${i}`, i))
  assert.equal(many.length, HISTORY_LIMIT)
  assert.equal(many[0].id, `r${HISTORY_LIMIT + 24}`)
})

test('summarize：汇总多轮练习', () => {
  assert.deepEqual(summarize([]), {
    sessions: 0,
    totalDone: 0,
    totalMs: 0,
    avgCpm: 0,
    bestCpm: 0,
    avgIndependentRate: 0,
    avgHintedRate: 0,
    lastCpm: 0,
  })

  const a = buildSessionRecord(makeSnapshot(10, 10, 0, 40), makeMeta({ id: 'a' }))
  const b = buildSessionRecord(makeSnapshot(30, 27, 2, 80, 60000, 3), makeMeta({ id: 'b' }))
  const s = summarize([b, a]) // 最新的在最前
  assert.equal(s.sessions, 2)
  assert.equal(s.totalDone, 40)
  assert.equal(s.totalMs, 120000)
  assert.equal(s.avgCpm, 60)
  assert.equal(s.bestCpm, 80)
  assert.equal(s.lastCpm, 80)
  assert.ok(Math.abs(s.avgIndependentRate - 0.95) < 1e-9, `平均独立正确率应为 0.95，实际 ${s.avgIndependentRate}`)
  assert.ok(Math.abs(s.avgHintedRate - 0.05) < 1e-9, `平均依赖提示率应为 0.05，实际 ${s.avgHintedRate}`)
})

test('序列化 / 反序列化：往返一致，且能识别坏数据', () => {
  const record = buildSessionRecord(makeSnapshot(12, 11, 1, 55), makeMeta())
  const text = serializeHistory([record])
  const back = parseHistory(text)
  assert.equal(back.length, 1)
  assert.equal(back[0].id, record.id)
  assert.equal(back[0].cpm, 55)
  assert.deepEqual(back[0].keyErrors, record.keyErrors)

  // 坏数据一律不抛异常
  assert.deepEqual(parseHistory(null), [])
  assert.deepEqual(parseHistory(''), [])
  assert.deepEqual(parseHistory('这不是 JSON'), [])
  assert.deepEqual(parseHistory('{"version":1}'), [])
  assert.deepEqual(parseHistory('{"records":"nope"}'), [])
  assert.deepEqual(parseHistory('[1,2,3]'), [])
  assert.deepEqual(parseHistory('[{"id":"x"}]'), [], '缺字段的记录应被丢弃')

  // 好坏混杂：只保留好的那条
  const mixed = JSON.stringify({ version: 1, records: [record, { id: 'bad' }, null, 42] })
  const parsed = parseHistory(mixed)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].id, record.id)
})

test('parseRecord / 旧记录补字段：缺的字段补默认值，不会让界面读到 undefined', () => {
  // 这条是「M5 之前的老格式」：只有 clean / cleanRate，没有 independent / hinted
  const legacy = { id: 'old', endedAt: 123, done: 5, cpm: 30, cleanRate: 0.9, keyErrors: {} }
  const record = parseRecord(legacy)
  assert.ok(record)
  assert.deepEqual(record.charErrors, {})
  assert.deepEqual(record.keyTimes, {})
  assert.equal(record.schemeName, '小鹤双拼')
  assert.equal(record.modeName, '全部拼音组合')
  assert.equal(record.keystrokes, 0)
  assert.equal(record.keyAccuracy, 1)
  assert.equal(record.startedAt, 123, 'startedAt 缺失时应回退到 endedAt')
  // 老字段要能映射到新字段，否则历史面板会显示 undefined
  assert.equal(record.independentRate, 0.9)
  assert.equal(record.hintedRate, 0)
  assert.equal(record.hinted, 0)

  assert.equal(parseRecord(null), null)
  assert.equal(parseRecord('字符串'), null)
  assert.equal(parseRecord({ id: 'x' }), null)
})

test('进行中快照：单独存取，与历史列表互不干扰', () => {
  const record = buildSessionRecord(makeSnapshot(8, 8, 0, 70), makeMeta({ id: 'active-1' }))
  const text = serializeActive(record)
  assert.equal(parseActive(text).id, 'active-1')
  assert.equal(serializeActive(null), null)
  assert.equal(parseActive(null), null)
  assert.equal(parseActive('[]'), null, '数组不是合法的进行中快照')
})

/* ───────────────── 导入（mergeRecords）───────────────── */

function makeRecord(id, endedAt, cpm = 50) {
  return buildSessionRecord(makeSnapshot(10, 9, 1, cpm), makeMeta({ id, endedAt }))
}

test('mergeRecords：导入到空历史', () => {
  const incoming = [makeRecord('a', 3000), makeRecord('b', 2000)]
  const result = mergeRecords([], incoming)
  assert.equal(result.added, 2)
  assert.equal(result.skipped, 0)
  assert.equal(result.dropped, 0)
  assert.deepEqual(result.records.map((r) => r.id), ['a', 'b'])
})

test('mergeRecords：按 id 去重，同一份文件导入两次不会翻倍', () => {
  const existing = [makeRecord('a', 3000)]
  const incoming = [makeRecord('a', 3000), makeRecord('b', 2000)]

  const first = mergeRecords(existing, incoming)
  assert.equal(first.added, 1, '只有 b 是新的')
  assert.equal(first.skipped, 1, 'a 重复')
  assert.equal(first.records.length, 2)

  // 第二次导入同一份文件：一条都不该加
  const second = mergeRecords(first.records, incoming)
  assert.equal(second.added, 0)
  assert.equal(second.skipped, 2)
  assert.equal(second.records.length, 2)
})

test('mergeRecords：结果按结束时间倒序，不假设导入文件顺序是对的', () => {
  const existing = [makeRecord('old', 1000), makeRecord('new', 9000)]
  const incoming = [makeRecord('mid', 5000), makeRecord('newest', 20000)]
  const result = mergeRecords(existing, incoming)
  assert.deepEqual(
    result.records.map((r) => r.id),
    ['newest', 'new', 'mid', 'old'],
  )
})

test('mergeRecords：超出上限时裁掉最旧的并如实报告丢弃条数', () => {
  const existing = []
  for (let i = 0; i < HISTORY_LIMIT; i += 1) existing.push(makeRecord(`e${i}`, 100000 - i))
  const incoming = [makeRecord('x1', 999999), makeRecord('x2', 999998)]

  const result = mergeRecords(existing, incoming)
  assert.equal(result.records.length, HISTORY_LIMIT)
  assert.equal(result.added, 2)
  assert.equal(result.dropped, 2, '多出来的两条最旧记录应该被丢掉')
  assert.equal(result.records[0].id, 'x1', '最新导入的应该在最前面')
  assert.ok(!result.records.some((r) => r.id === 'e199'), '最旧的应该被裁掉')
})

test('mergeRecords：空输入不报错', () => {
  assert.deepEqual(mergeRecords([], []), { records: [], added: 0, skipped: 0, dropped: 0 })
  const one = [makeRecord('a', 1000)]
  const result = mergeRecords(one, [])
  assert.equal(result.records.length, 1)
  assert.equal(result.added, 0)
})

test('导入往返：导出 -> 解析 -> 合并，数据完全一致', () => {
  const original = [makeRecord('r1', 5000, 66), makeRecord('r2', 4000, 44)]
  const exported = exportHistory(original)
  const parsed = parseHistory(exported)
  assert.equal(parsed.length, 2)

  const result = mergeRecords([], parsed)
  assert.equal(result.added, 2)
  assert.equal(result.records[0].cpm, 66)
  assert.equal(result.records[1].cpm, 44)
  // 关键字段都要活下来
  for (const key of ['done', 'independent', 'hinted', 'errors', 'cpm', 'independentRate', 'elapsedMs']) {
    assert.deepEqual(
      result.records.map((r) => r[key]),
      original.map((r) => r[key]),
      `字段 ${key} 在往返中丢了`,
    )
  }
  assert.deepEqual(result.records.map((r) => r.keyErrors), original.map((r) => r.keyErrors))
})

/* ───────────────── 多轮聚合（历史热力图）───────────────── */

function makeRecordWithErrors(id, endedAt, keyErrors, charErrors = {}) {
  const record = makeRecord(id, endedAt)
  return { ...record, keyErrors, charErrors }
}

test('aggregateKeyErrors：累计多轮的错误击键并按次数排序', () => {
  const list = [
    makeRecordWithErrors('r1', 3000, { KeyQ: 3, KeyW: 1 }, { 陈: 2 }),
    makeRecordWithErrors('r2', 2000, { KeyQ: 2, KeyE: 5 }, { 学: 1, 陈: 1 }),
    makeRecordWithErrors('r3', 1000, {}),
  ]
  const summary = aggregateKeyErrors(list)
  assert.equal(summary.rounds, 3)
  assert.equal(summary.keys, 3, 'Q/W/E 三个键')
  assert.equal(summary.total, 11, '3+1+2+5 = 11')
  assert.deepEqual(summary.errors, { KeyQ: 5, KeyW: 1, KeyE: 5 })
  // 次数相同的按 key 稳定排序：KeyE < KeyQ
  assert.deepEqual(summary.top, [
    { key: 'KeyE', count: 5 },
    { key: 'KeyQ', count: 5 },
    { key: 'KeyW', count: 1 },
  ])
})

test('aggregateKeyErrors：top 数量受限，空输入不报错', () => {
  const many = {}
  for (let i = 0; i < 20; i += 1) many[`Key${String.fromCharCode(65 + i)}`] = 20 - i
  const summary = aggregateKeyErrors([makeRecordWithErrors('r', 1000, many)], 5)
  assert.equal(summary.keys, 20, 'keys 报告的是全部涉及的键数')
  assert.equal(summary.top.length, 5, 'top 受 limit 限制')
  assert.equal(summary.top[0].count, 20)

  const empty = aggregateKeyErrors([])
  assert.deepEqual(empty, { errors: {}, total: 0, rounds: 0, keys: 0, top: [] })
})

test('aggregateCharErrors：按次数倒序，可限制条数', () => {
  const list = [
    makeRecordWithErrors('r1', 3000, {}, { 陈: 2, 学: 1 }),
    makeRecordWithErrors('r2', 2000, {}, { 陈: 3, 双: 4, 拼: 1 }),
  ]
  const all = aggregateCharErrors(list)
  // 次数相同（学/拼 各 1 次）时按字符升序：学 U+5B66 < 拼 U+62FC
  assert.deepEqual(all, [
    { char: '陈', count: 5 },
    { char: '双', count: 4 },
    { char: '学', count: 1 },
    { char: '拼', count: 1 },
  ])
  assert.deepEqual(aggregateCharErrors(list, 2), [
    { char: '陈', count: 5 },
    { char: '双', count: 4 },
  ])
  assert.deepEqual(aggregateCharErrors([]), [])
})

test('聚合：坏记录（缺 keyErrors/charErrors）不会让统计崩掉', () => {
  const broken = { id: 'x', endedAt: 1, done: 1, cpm: 1, independentRate: 1, keyErrors: null }
  const summary = aggregateKeyErrors([broken])
  assert.equal(summary.total, 0)
  assert.equal(summary.rounds, 1)
  assert.deepEqual(aggregateCharErrors([broken]), [])
})

test('exportHistory：带导出时间与汇总，内容可被 JSON.parse', () => {  const record = buildSessionRecord(makeSnapshot(15, 15, 0, 65), makeMeta())
  const parsed = JSON.parse(exportHistory([record]))
  assert.ok(typeof parsed.exportedAt === 'string')
  assert.equal(parsed.summary.sessions, 1)
  assert.equal(parsed.records.length, 1)
  assert.equal(parsed.records[0].cpm, 65)
})

test('格式化：时长与时间戳', () => {
  assert.equal(formatDuration(0), '0:00')
  assert.equal(formatDuration(9500), '0:10')
  assert.equal(formatDuration(65000), '1:05')
  assert.equal(formatDuration(3661000), '1:01:01')
  assert.equal(formatDuration(-5), '0:00')

  const formatted = formatTime(new Date(2026, 0, 2, 9, 7).getTime())
  assert.equal(formatted, '01-02 09:07')
})
