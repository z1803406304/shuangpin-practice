<script setup lang="ts">
/** 顶栏：方案 / 题库模式 / 模式专属设置 / 显示开关 / 面板入口 */
import { computed } from 'vue'

import { getMode, DRILL_KINDS, HANZI_RANGES, MODES, WORD_SCOPES } from '../generators/index.ts'
import { SCHEMES } from '../core/schemes/index.ts'
import { customTexts } from '../stores/customTexts.ts'
import { startSession } from '../stores/session.ts'
import { settings } from '../stores/settings.ts'
import { openCustomTexts, openSchemeHelp, openSettings } from '../stores/ui.ts'

const mode = computed(() => getMode(settings.modeId))
const activeTextName = computed(() => customTexts.value[0]?.name ?? '还没有文本')

/** 下拉框选完就把焦点交还给页面，否则后续打键会被控件吃掉 */
function blurTarget(event: Event): void {
  const el = event.target
  if (el instanceof HTMLElement) el.blur()
}
</script>

<template>
  <header class="topbar">
    <label class="field">
      <span class="name">双拼方案:</span>
      <select v-model="settings.schemeId" @change="blurTarget">
        <option v-for="item in SCHEMES" :key="item.id" :value="item.id">{{ item.name }}</option>
      </select>
    </label>

    <label class="field">
      <span class="name">练习模式:</span>
      <select v-model="settings.modeId" @change="blurTarget">
        <option v-for="item in MODES" :key="item.id" :value="item.id">{{ item.name }}</option>
      </select>
    </label>

    <label v-if="mode.option === 'hanziRange'" class="field">
      <span class="name">字频范围:</span>
      <select v-model.number="settings.hanziRange" @change="blurTarget">
        <option v-for="range in HANZI_RANGES" :key="range" :value="range">前 {{ range }} 常用字</option>
      </select>
    </label>

    <label v-if="mode.option === 'drillKind'" class="field">
      <span class="name">题型:</span>
      <select v-model="settings.drillKind" @change="blurTarget">
        <option v-for="kind in DRILL_KINDS" :key="kind.id" :value="kind.id">{{ kind.name }}</option>
      </select>
    </label>

    <label v-if="mode.option === 'wordScope'" class="field">
      <span class="name">词库范围:</span>
      <select v-model="settings.wordScope" @change="blurTarget">
        <option v-for="scope in WORD_SCOPES" :key="scope.id" :value="scope.id">{{ scope.name }}</option>
      </select>
    </label>

    <button v-if="mode.option === 'customText'" class="link" type="button" @click="openCustomTexts()">
      编辑文本（{{ activeTextName }}）
    </button>

    <label v-if="mode.id !== 'drill' && mode.id !== 'custom'" class="field">
      <span class="name">随机方式:</span>
      <select v-model="settings.sample" @change="blurTarget">
        <option value="weighted">常用优先</option>
        <option value="uniform">均匀随机</option>
      </select>
    </label>

    <span class="field note">
      <span class="name">模式说明:</span>
      <span class="value">{{ mode.description }}</span>
    </span>

    <label class="field check">
      <input v-model="settings.showKeyMap" type="checkbox" />
      <span>键位图</span>
    </label>

    <label class="field check">
      <input v-model="settings.showHint" type="checkbox" />
      <span>提示键</span>
    </label>

    <label class="field check">
      <input v-model="settings.strict" type="checkbox" />
      <span>严格模式</span>
    </label>

    <label class="field check">
      <input v-model="settings.autoHint" type="checkbox" />
      <span>卡住自动提示</span>
    </label>

    <label class="field check">
      <input v-model="settings.nightMode" type="checkbox" />
      <span>夜间模式</span>
    </label>

    <button class="restart" type="button" @click="openSchemeHelp()">方案说明</button>
    <button class="restart" type="button" @click="openSettings()">更多设置</button>
    <button class="restart" type="button" @click="startSession()">重新开始</button>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 7px 16px;
  padding: 9px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
}

.field {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: var(--text-dim);
}

.name {
  color: var(--text-dim);
}

.note .value {
  color: var(--text);
}

select {
  font-family: inherit;
  font-size: 13px;
  padding: 2px 4px;
  color: var(--text);
  background: var(--panel-soft);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  outline: none;
}

select:focus {
  border-color: var(--accent);
}

.check {
  cursor: pointer;
  user-select: none;
}

.check input {
  accent-color: var(--accent);
  cursor: pointer;
}

.check span {
  color: var(--text);
}

.restart,
.link {
  font-size: 13px;
  padding: 3px 10px;
  color: var(--text);
  background: var(--panel-soft);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  cursor: pointer;
}

.link {
  max-width: 230px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--accent);
}

.restart:hover,
.link:hover {
  border-color: var(--accent);
  color: var(--accent);
}

@media (max-width: 1100px) {
  .note {
    display: none;
  }
}
</style>
