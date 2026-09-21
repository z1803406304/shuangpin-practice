<script setup lang="ts">
/** 统计条下方的一排动作：结算本轮 / 历史记录 / 热力图开关 */
import { computed } from 'vue'

import { MIN_QUESTIONS_TO_SAVE } from '../core/history.ts'
import { liveStats, finishRound, state, togglePause } from '../stores/session.ts'
import { records } from '../stores/history.ts'
import { openHistory } from '../stores/ui.ts'
import { settings } from '../stores/settings.ts'

const canFinish = computed(() => liveStats.value.done > 0)
const phaseLabel = computed(() =>
  state.phase === 'running' ? '暂停' : state.phase === 'paused' ? '继续' : '开始练习',
)
const progressHint = computed(() => {
  if (state.phase === 'idle') return '按空格开始本轮练习'
  if (state.phase === 'paused') return '已暂停 · 暂停时间不计入成绩'
  const done = liveStats.value.done
  if (done === 0) return '开始敲键就会自动记录本轮成绩'
  if (done < MIN_QUESTIONS_TO_SAVE) return `再练 ${MIN_QUESTIONS_TO_SAVE - done} 题即可存入历史`
  return `本轮已记录 ${done} 题`
})
</script>

<template>
  <div class="actions">
    <span class="hint">{{ progressHint }}</span>

    <button class="btn" type="button" :class="{ primary: state.phase !== 'running' }" @click="togglePause()">
      {{ phaseLabel }}
    </button>

    <button class="btn primary" type="button" :disabled="!canFinish" @click="finishRound(true)">
      结束本轮并结算
    </button>

    <button class="btn" type="button" @click="openHistory()">
      历史记录<span v-if="records.length" class="badge">{{ records.length }}</span>
    </button>

    <label class="toggle" title="在键位图上按错误次数着色">
      <input v-model="settings.heatmap" type="checkbox" />
      <span>错误热力图</span>
    </label>

    <span v-if="state.roundSaved" class="saved">✓ 上一轮已存入历史</span>
  </div>
</template>

<style scoped>
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 6px 16px 8px;
  border-top: 1px solid var(--border);
  font-size: 12.5px;
  color: var(--text-dim);
}

.hint {
  color: var(--text-faint);
}

.btn {
  font-size: 12.5px;
  padding: 3px 10px;
  color: var(--text);
  background: var(--panel-soft);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  cursor: pointer;
}

.btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.btn.primary {
  border-color: var(--accent);
  color: var(--accent);
}

.badge {
  display: inline-block;
  min-width: 16px;
  margin-left: 5px;
  padding: 0 4px;
  font-size: 11px;
  text-align: center;
  color: var(--panel);
  background: var(--accent);
  border-radius: 8px;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  user-select: none;
  color: var(--text);
}

.toggle input {
  accent-color: var(--accent);
  cursor: pointer;
}

.saved {
  color: var(--ok);
}
</style>
