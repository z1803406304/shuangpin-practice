<script setup lang="ts">
/**
 * 应用外壳：布局 + 全局键盘捕获 + 面板开关。
 *
 * 键盘策略：不依赖任何 <input> 焦点，直接在 window 上监听 keydown，
 * 用 KeyboardEvent.code（物理键位）判定，所以不受键盘布局影响；
 * 输入法候选态（isComposing / keyCode 229）直接忽略，避免中文输入法抢键。
 * 结算/历史面板打开时，练习输入整体让路，只保留 Esc 关闭。
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'

import ActionBar from './components/ActionBar.vue'
import CustomTextDialog from './components/CustomTextDialog.vue'
import HeatmapLegend from './components/HeatmapLegend.vue'
import HelpFooter from './components/HelpFooter.vue'
import HistoryPanel from './components/HistoryPanel.vue'
import KeyMap from './components/KeyMap.vue'
import PromptCard from './components/PromptCard.vue'
import ResultPanel from './components/ResultPanel.vue'
import SchemeHelpDialog from './components/SchemeHelpDialog.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import StartPauseGuard from './components/StartPauseGuard.vue'
import StatsBar from './components/StatsBar.vue'
import TopBar from './components/TopBar.vue'
import ZeroInitialTable from './components/ZeroInitialTable.vue'
import { getScheme } from './core/schemes/index.ts'
import {
  backspaceKey,
  checkpoint,
  initSession,
  keyErrors,
  nextCode,
  pauseRound,
  pressCode,
  remainingLetters,
  showKeyHint,
  spaceOrEnter,
  state,
  togglePause,
  toggleReveal,
  typedCodes,
} from './stores/session.ts'
import { settings } from './stores/settings.ts'
import { closePanel, openSchemeHelp, panel } from './stores/ui.ts'

const scheme = computed(() => getScheme(settings.schemeId))

/** 显示答案时高亮的键 */
const revealCodes = computed(() => (state.revealed ? remainingLetters.value.map(toCode) : []))

/** 字母 -> 键码（用当前方案的键位表反查） */
function toCode(letter: string): string {
  for (const row of scheme.value.keyRows) {
    for (const key of row) {
      if (key.letter.toLowerCase() === letter) return key.code
    }
  }
  return ''
}

function isFormControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  // select / 文本框 保留给控件自己处理（否则会毁掉下拉框和复选框）
  return target.tagName === 'SELECT' || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
}

function onKeydown(event: KeyboardEvent): void {
  // 中文输入法正在组字时不要抢
  if (event.isComposing || event.keyCode === 229) return
  if (event.ctrlKey || event.metaKey || event.altKey) return

  // 面板打开时，练习输入全部让路
  if (panel.value !== 'none') {
    if (event.code === 'Escape') {
      event.preventDefault()
      closePanel()
    }
    return
  }

  if (isFormControl(event.target)) return

  switch (event.code) {
    case 'Space':
    case 'Enter':
    case 'NumpadEnter':
      event.preventDefault()
      // 未开始/已暂停时，spaceOrEnter 内部会转成「开始/继续」
      spaceOrEnter()
      return
    case 'Escape':
      event.preventDefault()
      togglePause()
      return
    case 'Tab':
      event.preventDefault()
      toggleReveal()
      return
    case 'Backspace':
      event.preventDefault()
      backspaceKey()
      return
    default:
      break
  }

  if (/^Key[A-Z]$/.test(event.code) || event.code === 'Semicolon') {
    event.preventDefault()
    pressCode(event.code)
  }
}

/** 切走标签页就自动暂停：否则卡住提示会在你不在的时候误触发（会被记成依赖提示） */
function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    checkpoint()
    pauseRound('tab-hidden')
  }
}

function onBeforeUnload(): void {
  checkpoint()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)
  document.addEventListener('visibilitychange', onVisibilityChange)
  initSession()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', onBeforeUnload)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <div class="app" :class="{ night: settings.nightMode }">
    <TopBar />

    <main class="stage">
      <PromptCard />

      <template v-if="settings.showKeyMap">
        <KeyMap
          class="keymap"
          :scheme="scheme"
          :typed="typedCodes"
          :next-code="nextCode"
          :hint="showKeyHint"
          :error-code="state.flashWrong"
          :right-code="state.flashRight"
          :reveal-codes="revealCodes"
          :key-errors="keyErrors"
          :heatmap="settings.heatmap"
          @press="pressCode"
        />
        <ZeroInitialTable :scheme="scheme" />
        <div class="scheme-caption">
          <span>{{ scheme.name }} · {{ state.layout === 'flow' ? '逐字推进' : '声母 + 韵母' }}</span>
          <button class="caption-link" type="button" @click="openSchemeHelp()">看方案说明</button>
          <HeatmapLegend v-if="settings.heatmap" :key-errors="keyErrors" />
        </div>
      </template>

      <div v-else class="keymap-hidden">
        （键位图已隐藏 —— 盲打模式；按 <kbd>Tab</kbd> 仍可看答案）
      </div>

      <!-- 未开始 / 已暂停时盖住练习区（顶栏保持可点，方便顺手改设置） -->
      <StartPauseGuard v-if="state.phase !== 'running'" />
    </main>

    <StatsBar />
    <ActionBar />
    <HelpFooter />

    <ResultPanel v-if="panel === 'result'" />
    <HistoryPanel v-if="panel === 'history'" />
    <SettingsPanel v-if="panel === 'settings'" />
    <CustomTextDialog v-if="panel === 'custom'" />
    <SchemeHelpDialog v-if="panel === 'scheme'" />
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.stage {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px 0 8px;
}

.keymap {
  margin-top: 4px;
}

.scheme-caption {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 14px;
  font-size: 12px;
  color: var(--text-dim);
}

.caption-link {
  padding: 0;
  font-size: 12px;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline dotted;
}

.keymap-hidden {
  padding: 24px;
  color: var(--text-dim);
  font-size: 13px;
}

kbd {
  font-family: var(--mono);
  font-size: 11.5px;
  padding: 1px 5px;
  border: 1px solid var(--border-strong);
  border-radius: 3px;
}
</style>
