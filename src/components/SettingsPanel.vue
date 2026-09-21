<script setup lang="ts">
/**
 * 更多设置面板。
 * 数值型选项放在这里而不是顶栏，是为了不把顶栏挤爆、也不占练习区的垂直空间。
 */
import { computed } from 'vue'

import { closePanel } from '../stores/ui.ts'
import { resetSettings, settings } from '../stores/settings.ts'

const policyText = computed(() => {
  if (!settings.autoHint) return '已关闭'
  const hint = `${settings.hintAfterMs / 1000} 秒闪键位`
  if (settings.revealAfterMs <= 0) return `${hint}，不自动给答案`
  return `${hint}，${settings.revealAfterMs / 1000} 秒后显示答案`
})

const nextText = computed(() => (settings.autoNextMs <= 0 ? '手动切下一题（空格/回车）' : `答对后 ${settings.autoNextMs}ms 自动下一题`))
</script>

<template>
  <div class="overlay" @click.self="closePanel()">
    <div class="card">
      <header>
        <h2>更多设置</h2>
        <span class="meta">设置保存在本机浏览器（localStorage）</span>
        <button class="close" type="button" title="关闭（Esc）" @click="closePanel()">✕</button>
      </header>

      <section>
        <h3>卡住自动提示 <span class="sub">一个字卡太久时，在键位图上闪烁该按的键</span></h3>
        <label class="row check">
          <input v-model="settings.autoHint" type="checkbox" />
          <span>启用自动提示</span>
        </label>
        <div class="row">
          <span class="name">等待多久开始闪键位</span>
          <select v-model.number="settings.hintAfterMs" :disabled="!settings.autoHint">
            <option :value="1500">1.5 秒</option>
            <option :value="2000">2 秒</option>
            <option :value="3000">3 秒（默认）</option>
            <option :value="5000">5 秒</option>
            <option :value="8000">8 秒</option>
          </select>
        </div>
        <div class="row">
          <span class="name">再久一点是否直接给答案</span>
          <select v-model.number="settings.revealAfterMs" :disabled="!settings.autoHint">
            <option :value="0">不自动给答案（只闪键位）</option>
            <option :value="6000">6 秒后显示答案</option>
            <option :value="10000">10 秒后显示答案</option>
            <option :value="15000">15 秒后显示答案</option>
          </select>
        </div>
        <p class="note">
          当前策略：{{ policyText }}。<br />
          提示过的题<strong>不计入独立正确率</strong>（会单独统计「依赖提示」），
          这样卡住时放心看提示，成绩也不会虚高。自己按 <kbd>Tab</kbd> 看答案同样算用过提示。
        </p>
      </section>

      <section>
        <h3>答题节奏</h3>
        <div class="row">
          <span class="name">答对之后</span>
          <select v-model.number="settings.autoNextMs">
            <option :value="0">手动切下一题</option>
            <option :value="120">自动（很快）</option>
            <option :value="160">自动（默认）</option>
            <option :value="400">自动（慢一点，看清反馈）</option>
          </select>
        </div>
        <p class="note">当前：{{ nextText }}</p>
        <div class="row">
          <span class="name">多久没输入自动暂停</span>
          <select v-model.number="settings.autoPauseMs">
            <option :value="0">不自动暂停</option>
            <option :value="30000">30 秒</option>
            <option :value="60000">60 秒（默认）</option>
            <option :value="120000">2 分钟</option>
          </select>
        </div>
        <p class="note">
          切走标签页也会自动暂停。<strong>暂停期间不计入用时</strong>，也不会让「卡住提示」误触发；
          因为离开较久而暂停的，继续后本题会重新开始。<br />
          未开始 / 已暂停时用 <kbd>空格</kbd> 开始或继续，<kbd>Esc</kbd> 暂停或继续。
        </p>
      </section>

      <section>
        <h3>显示与声音</h3>
        <div class="row">
          <span class="name">题面字号</span>
          <select v-model="settings.fontSize">
            <option value="small">小</option>
            <option value="normal">标准</option>
            <option value="large">大</option>
          </select>
        </div>
        <label class="row check">
          <input v-model="settings.soundEnabled" type="checkbox" />
          <span>按键音效（WebAudio 合成，不需要音频文件）</span>
        </label>
      </section>

      <footer>
        <span class="about">
          v0.2.0 · 小鹤双拼 · 键位表已用官方码表逐字交叉验证（7701 字一致率 99.65%）
        </span>
        <button class="btn" type="button" @click="resetSettings()">恢复默认设置</button>
        <button class="btn primary" type="button" @click="closePanel()">完成</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(16, 20, 26, 0.42);
  backdrop-filter: blur(2px);
}

.card {
  width: min(620px, 100%);
  max-height: 100%;
  overflow: auto;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 18px 48px rgba(16, 24, 40, 0.28);
  padding: 16px 20px 14px;
}

header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}

h2 {
  margin: 0;
  font-size: 17px;
}

.meta {
  flex: 1;
  font-size: 12px;
  color: var(--text-faint);
}

.close {
  background: none;
  border: none;
  font-size: 15px;
  color: var(--text-dim);
  cursor: pointer;
}

.close:hover {
  color: var(--danger);
}

section {
  padding: 12px 0 4px;
  border-bottom: 1px dashed var(--border);
}

section:last-of-type {
  border-bottom: none;
}

h3 {
  margin: 0 0 8px;
  font-size: 13px;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.sub {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-faint);
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 7px;
  font-size: 13px;
}

.row.check {
  cursor: pointer;
  user-select: none;
}

.row.check input {
  accent-color: var(--accent);
  cursor: pointer;
}

.name {
  color: var(--text-dim);
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

select:disabled {
  opacity: 0.45;
}

.note {
  margin: 4px 0 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-dim);
}

.note strong {
  color: var(--text);
}

kbd {
  font-family: var(--mono);
  font-size: 11.5px;
  padding: 1px 5px;
  border: 1px solid var(--border-strong);
  border-radius: 3px;
}

footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.about {
  flex: 1;
  min-width: 200px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-faint);
}

.btn {
  font-size: 13px;
  padding: 4px 12px;
  color: var(--text);
  background: var(--panel-soft);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  cursor: pointer;
}

.btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.btn.primary {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
