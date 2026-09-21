<script setup lang="ts">
/**
 * 结算面板：一轮练习结束后的成绩单。
 *
 * 除了常规的速度/准确率，这里重点回答两个不同的问题：
 * - 「哪些键我总按错」= keyErrors（手滑 / 记混）
 * - 「哪些键我要想很久」= keyTimes（没记住键位）
 * 两者的练法完全不同，所以分开列。
 */
import { computed } from 'vue'

import { formatDuration, formatTime, type SessionRecord } from '../core/history.ts'
import { codeToLetter } from '../core/keys.ts'
import { slowestKeys, topEntries } from '../core/stats.ts'
import { closePanel, lastResult, lastResultSaved, openHistory } from '../stores/ui.ts'

const record = computed<SessionRecord | null>(() => lastResult.value)

const topKeys = computed(() => (record.value ? topEntries(record.value.keyErrors, 10) : []))
const topChars = computed(() => (record.value ? topEntries(record.value.charErrors, 10) : []))

const slowKeys = computed(() => {
  const r = record.value
  if (!r) return []
  const strict = slowestKeys(r.keyTimes, 6, 2)
  return strict.length > 0 ? strict : slowestKeys(r.keyTimes, 6, 1)
})

const maxKeyCount = computed(() => Math.max(1, ...topKeys.value.map((k) => k.count)))
const maxCharCount = computed(() => Math.max(1, ...topChars.value.map((k) => k.count)))

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}
</script>

<template>
  <div v-if="record" class="overlay" @click.self="closePanel()">
    <div class="card">
      <header>
        <h2>本轮结算</h2>
        <span class="meta">{{ record.schemeName }} · {{ record.modeName }} · {{ formatTime(record.endedAt) }}</span>
        <button class="close" type="button" title="关闭（Esc）" @click="closePanel()">✕</button>
      </header>

      <div class="metrics">
        <div class="metric">
          <span class="value">{{ record.cpm.toFixed(0) }}</span>
          <span class="label">字/分</span>
        </div>
        <div class="metric">
          <span class="value">{{ pct(record.independentRate) }}</span>
          <span class="label">独立正确率</span>
        </div>
        <div class="metric">
          <span class="value">{{ record.hinted }}</span>
          <span class="label">依赖提示</span>
        </div>
        <div class="metric">
          <span class="value">{{ pct(record.keyAccuracy) }}</span>
          <span class="label">按键正确率</span>
        </div>
        <div class="metric">
          <span class="value">{{ record.done }}</span>
          <span class="label">完成题数</span>
        </div>
        <div class="metric">
          <span class="value">{{ formatDuration(record.elapsedMs) }}</span>
          <span class="label">有效用时</span>
        </div>
        <div class="metric">
          <span class="value">{{ record.maxCombo }}</span>
          <span class="label">最长连击</span>
        </div>
        <div class="metric">
          <span class="value">{{ record.errors }}</span>
          <span class="label">错误击键</span>
        </div>
        <div class="metric">
          <span class="value">{{ record.kpm.toFixed(0) }}</span>
          <span class="label">键/分</span>
        </div>
      </div>

      <p class="breakdown">
        完成 {{ record.done }} 题：完全独立 <strong>{{ record.independent }}</strong> · 依赖提示
        <strong>{{ record.hinted }}</strong> · 有错但没用提示
        <strong>{{ Math.max(0, record.done - record.independent - record.hinted) }}</strong>
        <span class="tip">（提示过的题不计入独立正确率）</span>
      </p>

      <div class="columns">
        <section>
          <h3>最常按错的键 <span class="sub">手滑 / 记混</span></h3>
          <ul v-if="topKeys.length" class="bars">
            <li v-for="item in topKeys" :key="item.key">
              <span class="kbd">{{ codeToLetter(item.key) }}</span>
              <span class="bar"><i :style="{ width: `${(item.count / maxKeyCount) * 100}%` }" /></span>
              <span class="num">{{ item.count }}</span>
            </li>
          </ul>
          <p v-else class="empty">本轮没有按错，漂亮。</p>
        </section>

        <section>
          <h3>最容易错的字 <span class="sub">重点复习</span></h3>
          <ul v-if="topChars.length" class="bars">
            <li v-for="item in topChars" :key="item.key">
              <span class="han">{{ item.key }}</span>
              <span class="bar"><i :style="{ width: `${(item.count / maxCharCount) * 100}%` }" /></span>
              <span class="num">{{ item.count }}</span>
            </li>
          </ul>
          <p v-else class="empty">没有出错的字。</p>
        </section>

        <section>
          <h3>反应最慢的键 <span class="sub">还没记住键位</span></h3>
          <ul v-if="slowKeys.length" class="bars">
            <li v-for="item in slowKeys" :key="item.key">
              <span class="kbd">{{ codeToLetter(item.key) }}</span>
              <span class="time">{{ (item.avgMs / 1000).toFixed(2) }}s</span>
              <span class="num">{{ item.count }} 次</span>
            </li>
          </ul>
          <p v-else class="empty">数据还不够（多练几题就能看出来）。</p>
        </section>
      </div>

      <footer>
        <span class="save-state" :class="{ ok: lastResultSaved }">
          {{ lastResultSaved ? '✓ 已存入历史记录' : '本轮题数太少，未存入历史' }}
        </span>
        <button class="btn" type="button" @click="openHistory()">查看历史</button>
        <button class="btn primary" type="button" @click="closePanel()">继续练习</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(16, 20, 26, 0.42);
  backdrop-filter: blur(2px);
}

.card {
  width: min(860px, 100%);
  max-height: 100%;
  overflow: auto;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 18px 48px rgba(16, 24, 40, 0.28);
  padding: 16px 20px 14px;
}

header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}

h2 {
  margin: 0;
  font-size: 17px;
}

.meta {
  flex: 1;
  font-size: 12px;
  color: var(--text-faint);
}

.close {
  background: none;
  border: none;
  font-size: 15px;
  color: var(--text-dim);
  cursor: pointer;
}

.close:hover {
  color: var(--danger);
}

.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
  gap: 10px 8px;
  padding: 14px 0;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: center;
}

.metric .value {
  font-family: var(--mono);
  font-size: 20px;
  font-weight: 600;
}

.metric .label {
  font-size: 11.5px;
  color: var(--text-dim);
}

.breakdown {
  margin: 0 0 12px;
  padding: 8px 10px;
  font-size: 12.5px;
  color: var(--text-dim);
  background: var(--panel-soft);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.breakdown strong {
  font-family: var(--mono);
  color: var(--text);
}

.breakdown .tip {
  color: var(--text-faint);
}

.columns {
  display: grid;  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  padding-top: 4px;
}

section h3 {
  margin: 0 0 8px;
  font-size: 13px;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.sub {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-faint);
}

.bars {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.bars li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.kbd {
  width: 22px;
  height: 22px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--mono);
  font-size: 12px;
  background: var(--panel-soft);
  border: 1px solid var(--border-strong);
  border-radius: 3px;
}

.han {
  width: 22px;
  flex: none;
  text-align: center;
  font-family: var(--han);
  font-size: 15px;
}

.bar {
  flex: 1;
  height: 7px;
  background: var(--slot);
  border-radius: 4px;
  overflow: hidden;
}

.bar i {
  display: block;
  height: 100%;
  background: var(--danger);
  opacity: 0.75;
  border-radius: 4px;
}

.num,
.time {
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--text-dim);
  flex: none;
}

.time {
  flex: 1;
  color: var(--hint-border);
}

.empty {
  margin: 0;
  font-size: 12px;
  color: var(--text-faint);
}

footer {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.save-state {
  flex: 1;
  font-size: 12px;
  color: var(--text-faint);
}

.save-state.ok {
  color: var(--ok);
}

.btn {
  font-size: 13px;
  padding: 4px 12px;
  color: var(--text);
  background: var(--panel-soft);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  cursor: pointer;
}

.btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.btn.primary {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
