<script setup lang="ts">
/**
 * 未开始 / 已暂停时盖在练习区上的提示层。
 *
 * 只盖住练习区（题面和键位图仍然可见，只是压暗），顶栏保持可点 ——
 * 暂停的时候经常正是要去改设置的时候。
 */
import { computed } from 'vue'

import { startOrResume, state } from '../stores/session.ts'
import { settings } from '../stores/settings.ts'

const isIdle = computed(() => state.phase === 'idle')

const title = computed(() => {
  if (isIdle.value) return '准备开始'
  if (state.pauseReason === 'tab-hidden') return '已暂停'
  if (state.pauseReason === 'idle') return '已暂停'
  return '已暂停'
})

const detail = computed(() => {
  if (isIdle.value) return '先切到系统自带的英文输入法；准备好后按空格开始。'
  if (state.pauseReason === 'tab-hidden') return '你切换到了别的标签页。暂停期间不计入成绩。'
  if (state.pauseReason === 'idle')
    return `超过 ${Math.round(settings.autoPauseMs / 1000)} 秒没有输入，已自动暂停。继续后本题会重新开始（那段时间闪过的提示不算你看过）。`
  return '按空格或点下面的按钮继续。暂停期间不计入成绩。'
})

const actionLabel = computed(() => (isIdle.value ? '开始练习（空格）' : '继续（空格）'))
</script>

<template>
  <div class="guard" @click="startOrResume()">
    <div class="card">
      <h3>{{ title }}</h3>
      <p>{{ detail }}</p>
      <button class="start" type="button" @click.stop="startOrResume()">{{ actionLabel }}</button>
      <p class="keys">
        <kbd>空格</kbd> 开始 / 继续 · <kbd>Esc</kbd> 暂停 / 继续
      </p>
    </div>
  </div>
</template>

<style scoped>
.guard {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bg) 72%, transparent);
  backdrop-filter: blur(1.5px);
  cursor: pointer;
}

.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 22px 30px;
  text-align: center;
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(16, 24, 40, 0.18);
}

h3 {
  margin: 0;
  font-size: 17px;
}

p {
  margin: 0;
  max-width: 420px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-dim);
}

.start {
  margin-top: 2px;
  padding: 7px 22px;
  font-size: 14px;
  color: var(--accent);
  background: var(--panel-soft);
  border: 1px solid var(--accent);
  border-radius: 6px;
  cursor: pointer;
}

.start:hover {
  background: var(--accent-soft);
}

.keys {
  font-size: 11.5px;
  color: var(--text-faint);
}

kbd {
  font-family: var(--mono);
  font-size: 11px;
  padding: 1px 5px;
  color: var(--text);
  background: var(--panel-soft);
  border: 1px solid var(--border-strong);
  border-radius: 3px;
}
</style>
