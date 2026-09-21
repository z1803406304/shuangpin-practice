<script setup lang="ts">
/**
 * 题面卡片。两种布局：
 * - single：单字/单音节大图（汉字 + 拼音 + 输入槽），键位训练也用这个
 * - flow：词语 / 句子逐字高亮，行的下方显示当前字的拼音与输入槽
 *
 * 之所以分开：句子有十几个字，用大字排版一屏放不下；
 * 而单字题放大显示更利于「一眼认出这个字」。
 */
import { computed } from 'vue'

import { currentPart, hintWaitProgress, state } from '../stores/session.ts'
import { settings } from '../stores/settings.ts'
import InputSlots from './InputSlots.vue'

const typedLetters = computed(() => state.judge.typed.map((code) => code.replace('Key', '').toLowerCase()))

const mark = computed<'ok' | 'bad' | ''>(() => {
  if (state.solved) return 'ok'
  if (state.everFailed) return 'bad'
  return ''
})

/** 句子行里每个字的字号：字越多越小 */
const lineClass = computed(() => {
  const count = state.parts.length
  if (count <= 4) return 'line-mid'
  if (count <= 10) return 'line-small'
  return 'line-tiny'
})

/** 键位训练题的题面是字母（韵母/声母）而不是汉字，用等宽字体 */
const isLatin = computed(() => /^[a-zü;]+$/i.test(currentPart.value?.display ?? ''))

/** 等待提示的进度条：只在进行中、开着自动提示、且本题还没打完时显示 */
const showWaitBar = computed(
  () => state.phase === 'running' && settings.autoHint && !state.solved && state.parts.length > 0,
)
const waitBarWidth = computed(() => `${Math.round(hintWaitProgress.value * 100)}%`)

/** 当前单元是否曾经按错（句子布局里给当前字标红） */
const currentFailed = computed(() => !state.solved && state.everFailed && state.parts[state.cursor] !== undefined)
</script>

<template>
  <div class="board" :class="[`size-${settings.fontSize}`, { solved: state.solved }]">
    <!-- ── 单字 / 单音节布局 ── -->
    <div v-if="state.layout === 'single'" class="single">
      <div class="char" :class="{ latin: isLatin }">{{ currentPart?.display }}</div>
      <div class="right">
        <div class="sub">{{ currentPart?.sub }}</div>
        <InputSlots
          v-if="currentPart"
          :letters="currentPart.encoded.letters"
          :typed="typedLetters"
          :revealed="state.revealed"
        />
      </div>
      <div class="mark" :class="mark">
        <span v-if="mark === 'ok'">✓</span>
        <span v-else-if="mark === 'bad'">✗</span>
      </div>
    </div>

    <!-- ── 词语 / 句子布局 ── -->
    <div v-else class="flow">
      <div class="line" :class="lineClass">
        <span
          v-for="(part, index) in state.parts"
          :key="index"
          class="unit"
          :class="{ current: index === state.cursor, done: index < state.cursor, failed: index === state.cursor && currentFailed }"
        >
          <span v-if="part.lead" class="punct">{{ part.lead }}</span>
          <span class="ch">{{ part.display }}</span>
          <span v-if="part.tail" class="punct">{{ part.tail }}</span>
        </span>
      </div>

      <div class="detail">
        <span class="detail-char" :class="{ latin: isLatin }">{{ currentPart?.display }}</span>
        <span class="detail-sub">{{ currentPart?.sub }}</span>
        <InputSlots
          v-if="currentPart"
          compact
          :letters="currentPart.encoded.letters"
          :typed="typedLetters"
          :revealed="state.revealed"
        />
        <span class="mark small" :class="mark">
          <span v-if="mark === 'ok'">✓</span>
          <span v-else-if="mark === 'bad'">✗</span>
        </span>
        <span class="progress">{{ state.cursor + (state.solved ? 1 : 0) }} / {{ state.parts.length }}</span>
      </div>
    </div>

    <!-- 等待提示的进度线（绝对定位，不占额外高度） -->
    <div v-if="showWaitBar" class="waitbar" :class="{ fired: state.hintStage >= 1 }">
      <i :style="{ width: waitBarWidth }" />
    </div>
  </div>

  <div class="hints">
    <span v-if="currentPart?.note" class="hint-note">{{ currentPart.note }}</span>
    <span v-if="state.hintStage >= 1" class="hint-key">⚑ 已提示：注意键位图上闪烁的键</span>
    <span v-if="state.revealed" class="hint-reveal">答案：{{ currentPart?.encoded.letters.join(' ') }}</span>
    <span v-if="state.warning" class="hint-warn">{{ state.warning }}</span>
    <span v-if="state.flashWrong" class="hint-wrong">按错了，再想想</span>
  </div>
</template>

<style scoped>
.board {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 132px;
  padding: 6px 16px;
}

/* 字号设置：只影响题面字号，不影响键位图 */
.size-small .single .char {
  font-size: 58px;
}
.size-large .single .char {
  font-size: 96px;
}
.size-small .single .sub {
  font-size: 24px;
}
.size-large .single .sub {
  font-size: 36px;
}

/* ── 单字布局 ── */
.single {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.char {
  font-family: var(--han);
  font-size: 76px;
  line-height: 1;
  letter-spacing: 0.02em;
}

.char.latin {
  font-family: var(--mono);
  font-size: 60px;
  letter-spacing: 0.04em;
}

.right {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.sub {
  font-family: var(--mono);
  font-size: 30px;
  line-height: 1;
  min-height: 30px;
  color: var(--text);
}

.mark {
  width: 42px;
  font-size: 40px;
  line-height: 1;
  text-align: center;
}

.mark.small {
  width: 30px;
  font-size: 26px;
}

.mark.ok {
  color: var(--ok);
}

.mark.bad {
  color: var(--danger);
}

/* ── 词语 / 句子布局 ── */
.flow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 100%;
}

.line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: 2px 4px;
  max-width: 1000px;
  line-height: 1.35;
  font-family: var(--han);
}

.line-mid .ch {
  font-size: 46px;
}
.line-small .ch {
  font-size: 34px;
}
.line-tiny .ch {
  font-size: 26px;
}

.size-small .line-mid .ch {
  font-size: 38px;
}
.size-large .line-mid .ch {
  font-size: 54px;
}

.unit {
  color: var(--text-faint);
  transition: color 0.12s ease;
}

.unit.done {
  color: var(--ok);
}

.unit.current {
  color: var(--text);
  font-weight: 600;
  border-bottom: 3px solid var(--accent);
}

.unit.current.failed {
  border-bottom-color: var(--danger);
}

.punct {
  font-size: 0.72em;
  color: var(--text-faint);
}

.detail {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 5px 14px;
  background: var(--panel-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.detail-char {
  font-family: var(--han);
  font-size: 30px;
  line-height: 1;
  min-width: 30px;
  text-align: center;
}

.detail-char.latin {
  font-family: var(--mono);
  font-size: 26px;
}

.detail-sub {
  font-family: var(--mono);
  font-size: 17px;
  color: var(--text-dim);
  min-width: 52px;
}

.progress {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-faint);
  margin-left: 4px;
}

.hints {
  min-height: 20px;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 6px 16px;
  font-size: 13px;
  color: var(--text-dim);
}

.hint-note {
  color: var(--text-dim);
}

.hint-key {
  color: var(--hint-border);
  font-weight: 600;
}

.hint-reveal {
  color: var(--accent);
}

.hint-wrong {
  color: var(--danger);
}

.hint-warn {
  color: var(--hint-border);
}

/* 等待提示的进度线 */
.waitbar {
  position: absolute;
  left: 22%;
  right: 22%;
  bottom: -2px;
  height: 2px;
  background: var(--slot);
  border-radius: 2px;
  overflow: hidden;
}

.waitbar i {
  display: block;
  height: 100%;
  background: var(--hint-border);
  opacity: 0.65;
  border-radius: 2px;
  transition: width 0.1s linear;
}

.waitbar.fired i {
  opacity: 1;
}

@media (max-width: 700px) {
  .char {
    font-size: 56px;
  }
  .sub {
    font-size: 22px;
  }
  .line-mid .ch {
    font-size: 34px;
  }
  .line-small .ch {
    font-size: 26px;
  }
  .line-tiny .ch {
    font-size: 21px;
  }
}
</style>
