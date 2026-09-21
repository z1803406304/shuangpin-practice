<script setup lang="ts">
/**
 * 自定义文本管理。
 * 粘贴 → 添加 → 拼音会转好并存在本机，之后出题直接用现成音节（不再需要 pinyin-pro）。
 */
import { ref } from 'vue'

import { countHanzi } from '../core/text.ts'
import {
  activeTextId,
  addCustomText,
  convertError,
  converting,
  customTexts,
  MAX_TEXT_CHARS,
  removeCustomText,
  setActiveText,
} from '../stores/customTexts.ts'
import { closePanel } from '../stores/ui.ts'
import { nextQuestion } from '../stores/session.ts'

const draft = ref('')
const justAdded = ref('')

const hanziCount = () => countHanzi(draft.value)

async function submit(): Promise<void> {
  justAdded.value = ''
  const record = await addCustomText(draft.value)
  if (record) {
    justAdded.value = `已添加「${record.name}」（${record.parts.length} 个字），正在用它出题`
    draft.value = ''
    // 立刻换成新文本的题目
    nextQuestion()
  }
}

function useText(id: string): void {
  setActiveText(id)
  nextQuestion()
}
</script>

<template>
  <div class="overlay" @click.self="closePanel()">
    <div class="card">
      <header>
        <h2>自定义文本</h2>
        <span class="meta">粘贴任意文本练；拼音在本机转好并保存，只存浏览器里</span>
        <button class="close" type="button" title="关闭（Esc）" @click="closePanel()">✕</button>
      </header>

      <section>
        <h3>添加新文本 <span class="sub">最多 {{ MAX_TEXT_CHARS }} 个汉字，最多保存 10 条</span></h3>
        <textarea
          v-model="draft"
          rows="5"
          placeholder="把要练的文章、句子、单词表粘贴到这里…"
          spellcheck="false"
        />
        <div class="row">
          <span class="count" :class="{ over: hanziCount() > MAX_TEXT_CHARS }">
            {{ hanziCount() }} / {{ MAX_TEXT_CHARS }} 个汉字
          </span>
          <button class="btn primary" type="button" :disabled="converting || hanziCount() === 0" @click="submit()">
            {{ converting ? '正在转换拼音…' : '添加并开始练' }}
          </button>
        </div>
        <p v-if="convertError" class="msg error">{{ convertError }}</p>
        <p v-if="justAdded" class="msg ok">{{ justAdded }}</p>
      </section>

      <section>
        <h3>已保存的文本 <span class="sub">点一下切换成它出题</span></h3>
        <ul v-if="customTexts.length" class="list">
          <li v-for="item in customTexts" :key="item.id" :class="{ active: item.id === activeTextId }">
            <button class="pick" type="button" @click="useText(item.id)">
              <span class="name">{{ item.name }}</span>
              <span class="info">{{ item.parts.length }} 字</span>
            </button>
            <button class="del" type="button" title="删除" @click="removeCustomText(item.id)">✕</button>
          </li>
        </ul>
        <p v-else class="empty">还没有保存过文本。</p>
      </section>

      <footer>
        <span class="tip">
          长文本会自动切成一小段一小段的题目（按句号/问号优先切），每段就是一道题。
        </span>
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
  width: min(680px, 100%);
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
  padding: 12px 0 6px;
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

textarea {
  width: 100%;
  padding: 8px 10px;
  font-family: inherit;
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--text);
  background: var(--panel-soft);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  outline: none;
  resize: vertical;
}

textarea:focus {
  border-color: var(--accent);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
}

.count {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-dim);
}

.count.over {
  color: var(--danger);
}

.msg {
  margin: 8px 0 0;
  font-size: 12.5px;
}

.msg.ok {
  color: var(--ok);
}

.msg.error {
  color: var(--danger);
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 190px;
  overflow: auto;
}

.list li {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-soft);
}

.list li.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.pick {
  flex: 1;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 10px;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  color: var(--text);
  font-size: 12.5px;
}

.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-faint);
}

.del {
  padding: 4px 8px;
  background: none;
  border: none;
  color: var(--text-faint);
  cursor: pointer;
  font-size: 11px;
}

.del:hover {
  color: var(--danger);
}

.empty {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-faint);
}

footer {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.tip {
  flex: 1;
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

.btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.btn.primary {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
