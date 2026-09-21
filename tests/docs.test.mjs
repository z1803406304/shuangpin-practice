/**
 * 文档写法自检的测试。
 *
 * 前两个用例验证规则本身能抓、能放；最后一个用例把仓库文档锁住，
 * 防止自述式、口语化与夸张表述重新出现（`npm test` 与 CI 都会跑到）。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ALLOW_MARKER, RULES, lintDocs, lintText } from '../scripts/check-docs.mjs'

test('规则表结构正确：名称唯一、正则带 g 标志', () => {
  const names = RULES.map((rule) => rule.name)
  assert.equal(new Set(names).size, names.length, '规则名重复')
  for (const rule of RULES) {
    assert.ok(rule.pattern instanceof RegExp, `${rule.name} 的 pattern 不是正则`)
    assert.ok(rule.pattern.global, `${rule.name} 的 pattern 缺少 g 标志（命中循环依赖它）`)
    assert.ok(rule.hint.length > 0, `${rule.name} 缺少修改提示`)
  }
})

test('每一类违规都能被抓出来', () => {
  const samples = [
    ['第一人称', '我们先把键位表抄下来。'],
    ['第一人称', '我自己在测试里写错了期望值。'],
    ['破折号', '结果就是白屏——而且没有报错。'],
    ['口语化用词', '这里踩了两个坑，顺手改掉了。'],
    ['套话过渡', '值得注意的是，这个函数是纯的。'],
    ['夸张表述', '这是一个完美而强大的方案。'],
  ]

  for (const [rule, line] of samples) {
    const hits = lintText(line)
    assert.ok(
      hits.some((hit) => hit.rule === rule),
      `没抓到 ${rule}：${line}`,
    )
    assert.equal(hits[0].line, 1)
  }
})

test('代码块、行内代码与允许标记不参与检查', () => {
  const text = [
    '正常的一句说明。',
    '```',
    '我们——踩坑 顺手 其实 完美',
    '```',
    '行内代码里的 `我们` 与 `——` 不算。',
    `这一行保留原样。 <!-- ${ALLOW_MARKER} -->`,
    '<!-- 注释里的我们也不算 -->',
  ].join('\n')

  assert.deepEqual(lintText(text), [])
})

test('仓库文档没有违规写法', () => {
  const violations = lintDocs()
  const report = violations.map((v) => `${v.file}:${v.line} [${v.rule}] ${v.text}`).join('\n')
  assert.deepEqual(violations, [], `发现违规写法：\n${report}`)
})
