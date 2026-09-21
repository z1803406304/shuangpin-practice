<script setup lang="ts">
/** 零声母表（a / ai / an / ang … 的整音节编码），与键位图一起显示。 */
import type { Scheme } from '../core/schemes/index.ts'

defineProps<{ scheme: Scheme }>()

/** 内部把 ü 记作 v，展示时还原 */
function display(code: string): string {
  return code.replace(/v/g, 'ü')
}
</script>

<template>
  <div class="zero">
    <div class="grid">
      <div v-for="entry in scheme.zeroInitial" :key="entry.syllable" class="cell">
        <span class="syl">{{ entry.syllable }}</span>
        <span class="code">{{ display(entry.code) }}</span>
      </div>
    </div>
    <div class="caption">零声母</div>
  </div>
</template>

<style scoped>
.zero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(6, 86px);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--panel);
}

.cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 3px 8px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  font-family: var(--mono);
  font-size: 12px;
}

.cell:nth-child(6n) {
  border-right: none;
}

.syl {
  color: var(--text-dim);
}

.code {
  color: var(--text);
  font-weight: 600;
}

.caption {
  font-size: 11.5px;
  color: var(--text-dim);
}

@media (max-width: 700px) {
  .grid {
    grid-template-columns: repeat(4, 74px);
  }
  .cell:nth-child(6n) {
    border-right: 1px solid var(--border);
  }
  .cell:nth-child(4n) {
    border-right: none;
  }
}
</style>
