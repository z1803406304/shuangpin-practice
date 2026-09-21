/**
 * 会话阶段状态机的测试。
 *
 * 这套状态机是为了修一个真 bug 才引入的：没有暂停时，走开一会儿
 * 「卡住自动提示」会在用户不在的时候触发，回来那道题就被记成「依赖提示」了。
 * 所以这里重点验证：未开始/暂停时不接收输入、不跑提示定时器，
 * 以及「因为离开较久而暂停」的恢复需要重做本题。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  acceptsInput,
  freezesTimer,
  isPauseEvent,
  PAUSE_EVENTS,
  reasonOf,
  reduce,
  resetsQuestionOnResume,
  shouldTick,
} from '../src/core/session-phase.ts'

test('状态转移：开始 / 继续 / 暂停 / 重新开始', () => {
  // 未开始 -> 开始 -> 进行中
  assert.equal(reduce('idle', 'start'), 'running')
  // 进行中 -> 各种暂停 -> 已暂停
  assert.equal(reduce('running', 'pause-manual'), 'paused')
  assert.equal(reduce('running', 'pause-tab-hidden'), 'paused')
  assert.equal(reduce('running', 'pause-idle'), 'paused')
  // 已暂停 -> 继续 -> 进行中
  assert.equal(reduce('paused', 'resume'), 'running')
  // 任意状态 -> 重新开始 -> 未开始
  assert.equal(reduce('running', 'restart'), 'idle')
  assert.equal(reduce('paused', 'restart'), 'idle')
  assert.equal(reduce('idle', 'restart'), 'idle')
})

test('状态转移：不能从非进行中状态「暂停」，也不会因为重复开始而出错', () => {
  // 未开始时的暂停是无效操作（比如切标签页时还没开始）
  for (const event of PAUSE_EVENTS) {
    assert.equal(reduce('idle', event), 'idle', `idle + ${event} 不应该变成暂停`)
    assert.equal(reduce('paused', event), 'paused', `paused + ${event} 应该保持暂停`)
  }
  assert.equal(reduce('running', 'start'), 'running', '重复开始应该无害')
  assert.equal(reduce('idle', 'resume'), 'running', '未开始时点「继续」也当作开始')
})

test('只有进行中才接收输入、才跑计时与提示', () => {
  assert.equal(acceptsInput('running'), true)
  assert.equal(acceptsInput('idle'), false)
  assert.equal(acceptsInput('paused'), false)

  assert.equal(shouldTick('running'), true)
  assert.equal(shouldTick('idle'), false)
  assert.equal(shouldTick('paused'), false)
})

test('暂停原因与恢复行为', () => {
  assert.equal(reasonOf('pause-manual'), 'manual')
  assert.equal(reasonOf('pause-tab-hidden'), 'tab-hidden')
  assert.equal(reasonOf('pause-idle'), 'idle')
  assert.equal(reasonOf('start'), null)
  assert.equal(reasonOf('resume'), null)
  assert.equal(reasonOf('restart'), null)

  for (const event of PAUSE_EVENTS) assert.equal(isPauseEvent(event), true)
  assert.equal(isPauseEvent('start'), false)
  assert.equal(isPauseEvent('resume'), false)
  assert.equal(isPauseEvent('restart'), false)

  // 暂停时长都要计入「不计时的发呆」（否则离开 10 分钟会把速度算成灾难）
  assert.equal(freezesTimer('manual'), true)
  assert.equal(freezesTimer('tab-hidden'), true)
  assert.equal(freezesTimer('idle'), true)
  assert.equal(freezesTimer(null), false)

  // 只有「离开较久」才需要重做本题：那段时间闪过的提示不算用户看过
  assert.equal(resetsQuestionOnResume('idle'), true)
  assert.equal(resetsQuestionOnResume('manual'), false, '手动暂停是主动行为，回来应该接着打')
  assert.equal(resetsQuestionOnResume('tab-hidden'), false)
  assert.equal(resetsQuestionOnResume(null), false)
})

test('完整生命周期：开始 -> 暂停 -> 继续 -> 暂停 -> 重新开始', () => {
  let phase = 'idle'
  const history = []
  const step = (event) => {
    phase = reduce(phase, event)
    history.push(`${event} -> ${phase}`)
  }
  step('pause-tab-hidden') // 还没开始就切走了，应该无效
  step('start')
  step('pause-idle')
  step('resume')
  step('pause-manual')
  step('resume')
  step('restart')

  assert.deepEqual(history, [
    'pause-tab-hidden -> idle',
    'start -> running',
    'pause-idle -> paused',
    'resume -> running',
    'pause-manual -> paused',
    'resume -> running',
    'restart -> idle',
  ])
  assert.equal(phase, 'idle')
})
