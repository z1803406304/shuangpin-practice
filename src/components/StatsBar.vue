<script setup lang="ts">
/** 实时统计条：速度 / 准确率 / 连击 / 完成题数 / 用时 */
import { computed } from 'vue'
import { liveStats, state } from '../stores/session.ts'

const s = computed(() => liveStats.value)

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const sec = total % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}
</script>

<template>
  <div class="stats">
    <div class="item">
      <span class="value">{{ s.cpm.toFixed(0) }}</span>
      <span class="label">字/分</span>
    </div>
    <div class="item">
      <span class="value">{{ pct(s.independentRate) }}</span>
      <span class="label">独立正确率</span>
    </div>
    <div class="item" :class="{ dim: s.hinted === 0 }">
      <span class="value">{{ s.hinted }}</span>
      <span class="label">依赖提示（{{ pct(s.hintedRate) }}）</span>
    </div>
    <div class="item">
      <span class="value">{{ pct(s.keyAccuracy) }}</span>
      <span class="label">按键正确率</span>
    </div>
    <div class="item">
      <span class="value">{{ s.combo }}</span>
      <span class="label">连击（最长 {{ s.maxCombo }}）</span>
    </div>
    <div class="item">
      <span class="value">{{ state.solvedTotal }}</span>
      <span class="label">已完成</span>
    </div>
    <div class="item">
      <span class="value">{{ formatMs(s.elapsedMs) }}</span>
      <span class="label">用时</span>
    </div>
    <div class="item">
      <span class="value">{{ s.errors }}</span>
      <span class="label">错误击键</span>
    </div>
  </div>
</template>

<style scoped>
.stats {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px 26px;
  padding: 8px 16px;
  border-top: 1px solid var(--border);
  color: var(--text-dim);
}

.item {
  display: flex;
  align-items: baseline;
  gap: 5px;
}

.value {
  font-family: var(--mono);
  font-size: 17px;
  color: var(--text);
  font-weight: 600;
}

.label {
  font-size: 12px;
}

.item.dim {
  opacity: 0.5;
}
</style>
