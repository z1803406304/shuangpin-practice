<script setup lang="ts">
/**
 * 键位图：三行键帽，每个键显示它承载的声母 / 韵母。
 * 高亮状态全部由 props 派生，与判定逻辑共用同一份键位数据（scheme.keyRows），
 * 所以「图上标的」和「程序判的」不可能不一致。
 */
import { computed } from 'vue'
import type { KeyDef, Scheme } from '../core/schemes/index.ts'
import { initialsOfKey } from '../core/schemes/xiaohe.ts'

const props = withDefaults(
  defineProps<{
    scheme: Scheme
    /** 已按对的键码 */
    typed?: string[]
    /** 下一键应该按的键码 */
    nextCode?: string | null
    /** 提示键开关：闪烁下一键 */
    hint?: boolean
    /** 刚按错的键码 */
    errorCode?: string | null
    /** 刚按对的键码 */
    rightCode?: string | null
    /** 显示答案时要高亮的剩余键码 */
    revealCodes?: string[]
    /** 错误次数统计（热力图） */
    keyErrors?: Record<string, number>
    /** 是否显示热力图着色 */
    heatmap?: boolean
  }>(),
  {
    typed: () => [],
    nextCode: null,
    hint: false,
    errorCode: null,
    rightCode: null,
    revealCodes: () => [],
    keyErrors: () => ({}),
    heatmap: false,
  },
)

const emit = defineEmits<{ (e: 'press', code: string): void }>()

/** 声母显示（字母键本身也是声母时补上） */
function initialLabel(key: KeyDef): string {
  return initialsOfKey(key).join(' ')
}

/** 韵母显示：内部把 ü 记作 v，展示时还原成 ü */
function finalLabel(final: string): string {
  return final.replace(/v/g, 'ü')
}

const maxError = computed(() => Math.max(1, ...Object.values(props.keyErrors)))

function keyClass(key: KeyDef): Record<string, boolean> {
  const hasMapping = key.initials.length > 0 || key.finals.length > 0
  return {
    'is-empty': !hasMapping,
    'is-typed': props.typed.includes(key.code),
    'is-next': props.hint && props.nextCode === key.code,
    'is-reveal': props.revealCodes.includes(key.code),
    'is-error': props.errorCode === key.code,
    'is-right': props.rightCode === key.code,
  }
}

function heatStyle(key: KeyDef): Record<string, string> {
  if (!props.heatmap) return {}
  const count = props.keyErrors[key.code] ?? 0
  if (count === 0) return {}
  const alpha = 0.18 + 0.5 * (count / maxError.value)
  return { background: `rgba(229, 72, 77, ${alpha.toFixed(2)})` }
}
</script>

<template>
  <div class="keymap">
    <div v-for="(row, rowIndex) in scheme.keyRows" :key="rowIndex" class="row" :style="{ paddingLeft: `${rowIndex * 31}px` }">
      <button
        v-for="key in row"
        :key="key.code"
        type="button"
        class="key"
        :class="keyClass(key)"
        :style="heatStyle(key)"
        :title="`按 ${key.letter} 键`"
        @click="emit('press', key.code)"
      >
        <span class="top">
          <span class="letter">{{ key.letter }}</span>
          <span v-if="initialLabel(key)" class="initial">{{ initialLabel(key) }}</span>
        </span>
        <span class="finals">
          <span v-for="f in key.finals" :key="f" class="final">{{ finalLabel(f) }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.keymap {
  display: flex;
  flex-direction: column;
  gap: 5px;
  /* 让三行键帽视觉居中：第三行最短 */
  align-items: flex-start;
  padding: 0 4px;
}

.row {
  display: flex;
  gap: 5px;
}

.key {
  width: 62px;
  height: 54px;
  padding: 3px 4px 2px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  background: var(--key-bg);
  border: 1px solid var(--key-border);
  border-radius: var(--radius);
  box-shadow: var(--key-shadow);
  color: var(--text);
  cursor: pointer;
  transition: transform 0.06s ease, background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
  user-select: none;
}

.key:active {
  transform: translateY(1px);
}

.key.is-empty {
  color: var(--text-faint);
  cursor: default;
}

.top {
  display: flex;
  align-items: baseline;
  gap: 3px;
  line-height: 1;
}

.letter {
  font-size: 17px;
  font-weight: 600;
}

/* 声母（zh / ch / sh）用蓝色区分，和截图一致 */
.initial {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  letter-spacing: 0.02em;
}

.finals {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 3px;
  font-size: 11.5px;
  line-height: 1.15;
  color: var(--text-dim);
}

.final {
  white-space: nowrap;
}

/* 已按对 */
.key.is-typed {
  border-color: var(--ok);
  background: var(--ok-soft);
}

/* 提示下一键（闪烁） */
.key.is-next {
  border-color: var(--hint-border);
  background: var(--hint-soft);
  animation: pulse 0.9s ease-in-out infinite;
}

/* 显示答案（Tab）时高亮剩余键 */
.key.is-reveal {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.key.is-error {
  border-color: var(--danger);
  background: var(--danger-soft);
  animation: shake 0.24s ease;
}

.key.is-right {
  border-color: var(--ok);
  box-shadow: 0 0 0 2px var(--ok-soft);
}

@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(232, 195, 74, 0);
  }
  50% {
    box-shadow: 0 0 0 3px rgba(232, 195, 74, 0.35);
  }
}

@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-2px);
  }
  75% {
    transform: translateX(2px);
  }
}

/* 热力图色阶图例在 HeatmapLegend.vue 里渲染（放在键位图下方的说明行，省一行高度） */

@media (max-width: 700px) {
  .key {
    width: 48px;
    height: 46px;
  }
  .row {
    gap: 4px;
  }
  .row {
    padding-left: 0 !important;
  }
  .letter {
    font-size: 15px;
  }
  .finals {
    font-size: 10px;
  }
}
</style>
