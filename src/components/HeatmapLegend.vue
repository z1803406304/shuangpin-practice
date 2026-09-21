<script setup lang="ts">
/** 错误热力图的色阶图例（紧凑一行，放在键位图下方） */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    keyErrors: Record<string, number>
    /** 统计范围的叫法：主界面是「本轮」，历史复盘里是「范围内」 */
    scopeLabel?: string
  }>(),
  { scopeLabel: '本轮' },
)

const maxError = computed(() => Math.max(1, ...Object.values(props.keyErrors)))

function legendColor(level: number): string {
  const alpha = 0.08 + 0.62 * (level / 5)
  return `rgba(229, 72, 77, ${alpha.toFixed(2)})`
}
</script>

<template>
  <span class="legend">
    <span class="label">错误热力图</span>
    <span class="swatches">
      <i v-for="level in 6" :key="level" :style="{ background: legendColor(level - 1) }" />
    </span>
    <span class="label">少 → 多（{{ scopeLabel }}最多按错 {{ maxError }} 次）</span>
  </span>
</template>

<style scoped>
.legend {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-dim);
}

.label {
  white-space: nowrap;
}

.swatches {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 3px;
  overflow: hidden;
}

.swatches i {
  width: 13px;
  height: 9px;
}
</style>
