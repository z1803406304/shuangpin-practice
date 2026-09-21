<script setup lang="ts">
/** 极简 SVG 折线图（速度曲线），不引图表库 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    values: number[]
    width?: number
    height?: number
    unit?: string
  }>(),
  { width: 460, height: 76, unit: '' },
)

const PAD = 6

const geometry = computed(() => {
  const values = props.values
  if (values.length === 0) return null
  const max = Math.max(...values, 1)
  const innerW = props.width - PAD * 2
  const innerH = props.height - PAD * 2
  const stepX = values.length > 1 ? innerW / (values.length - 1) : 0
  const points = values.map((value, index) => {
    const x = PAD + index * stepX
    const y = PAD + innerH - (value / max) * innerH
    return { x, y, value }
  })
  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const last = points[points.length - 1]
  const first = points[0]
  const area = `${first.x.toFixed(1)},${(props.height - PAD).toFixed(1)} ${line} ${last.x.toFixed(1)},${(props.height - PAD).toFixed(1)}`
  return { points, line, area, max, first, last }
})
</script>

<template>
  <div class="spark">
    <svg v-if="geometry" :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" role="img">
      <polygon class="area" :points="geometry.area" />
      <polyline class="line" :points="geometry.line" />
      <circle v-for="(p, i) in geometry.points" :key="i" class="dot" :cx="p.x" :cy="p.y" r="2" />
      <circle class="dot last" :cx="geometry.last.x" :cy="geometry.last.y" r="3.2" />
    </svg>
    <div v-if="geometry" class="scale">
      <span>最高 {{ geometry.max.toFixed(0) }}{{ unit }}</span>
      <span>{{ values.length }} 次练习</span>
    </div>
  </div>
</template>

<style scoped>
.spark {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

svg {
  display: block;
  overflow: visible;
}

.area {
  fill: var(--accent-soft);
  opacity: 0.75;
}

.line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 1.6;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.dot {
  fill: var(--accent);
  opacity: 0.55;
}

.dot.last {
  opacity: 1;
}

.scale {
  display: flex;
  justify-content: space-between;
  font-size: 11.5px;
  color: var(--text-faint);
}
</style>
