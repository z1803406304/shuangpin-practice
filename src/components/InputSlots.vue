<script setup lang="ts">
/** 输入槽：显示已按下的键，Tab 显示答案时给出虚线 ghost 字母 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 本题需要按的键帽字母 */
    letters: readonly string[]
    /** 已按对的字母 */
    typed: readonly string[]
    /** 是否显示答案 */
    revealed?: boolean
    /** 紧凑模式（句子布局） */
    compact?: boolean
  }>(),
  { revealed: false, compact: false },
)

const slots = computed(() =>
  props.letters.map((letter, index) => {
    const filled = index < props.typed.length
    return {
      key: `${letter}-${index}`,
      filled,
      ghost: !filled && props.revealed,
      text: filled ? props.typed[index] : letter,
    }
  }),
)
</script>

<template>
  <div class="slots" :class="{ compact }">
    <span
      v-for="slot in slots"
      :key="slot.key"
      class="slot"
      :class="{ filled: slot.filled, ghost: slot.ghost }"
    >
      {{ slot.filled || slot.ghost ? slot.text : '·' }}
    </span>
  </div>
</template>

<style scoped>
.slots {
  display: flex;
  gap: 6px;
}

.slot {
  width: 26px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--mono);
  font-size: 20px;
  color: var(--text-faint);
  background: var(--slot);
  border: 1px solid var(--border);
  border-radius: 4px;
  transition: all 0.12s ease;
}

.compact .slot {
  width: 22px;
  height: 26px;
  font-size: 17px;
}

.slot.filled {
  color: var(--ok);
  border-color: var(--ok);
  background: var(--ok-soft);
}

.slot.ghost {
  color: var(--accent);
  border-color: var(--accent);
  border-style: dashed;
}
</style>
