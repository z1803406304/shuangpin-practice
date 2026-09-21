<script setup lang="ts">
/**
 * 双拼方案说明：把「为什么这么按键」讲清楚。
 * 键位图和零声母表直接复用主页面的组件，保证说明和图永远一致。
 */
import { computed } from 'vue'

import { getScheme } from '../core/schemes/index.ts'
import { displayFinal } from '../core/text.ts'
import { settings } from '../stores/settings.ts'
import { closePanel } from '../stores/ui.ts'
import KeyMap from './KeyMap.vue'
import ZeroInitialTable from './ZeroInitialTable.vue'

const scheme = computed(() => getScheme(settings.schemeId))

/** 每个键承载的韵母，做成一览表方便背 */
const finalTable = computed(() =>
  scheme.value.keyRows
    .flat()
    .filter((key) => key.finals.length > 0)
    .map((key) => ({ letter: key.letter, finals: key.finals.map(displayFinal).join(' / ') })),
)
</script>

<template>
  <div class="overlay" @click.self="closePanel()">
    <div class="card">
      <header>
        <h2>{{ scheme.name }} · 方案说明</h2>
        <span class="meta">{{ scheme.description }}</span>
        <button class="close" type="button" title="关闭（Esc）" @click="closePanel()">✕</button>
      </header>

      <section>
        <h3>三条规则</h3>
        <ol class="rules">
          <li>
            <strong>一个音节 = 两个键</strong>：第一键按声母，第二键按韵母。
            例如「陈 chen」= <kbd>C</kbd> 的声母 <kbd>I</kbd>（ch）+ <kbd>F</kbd>（en）= <code>if</code>。
          </li>
          <li>
            <strong>zh / ch / sh 不在字母键上</strong>：它们分别落在 <kbd>V</kbd>、<kbd>I</kbd>、<kbd>U</kbd>。
            所以「是 shi」= <kbd>U</kbd> + <kbd>I</kbd> = <code>ui</code>，「中 zhong」= <kbd>V</kbd> + <kbd>S</kbd> = <code>vs</code>。
          </li>
          <li>
            <strong>y / w 当普通声母</strong>：不特殊处理。「王 wang」= <kbd>W</kbd> + <kbd>H</kbd>(ang) =
            <code>wh</code>，「要 yao」= <kbd>Y</kbd> + <kbd>C</kbd>(ao) = <code>yc</code>。
          </li>
        </ol>
        <p class="note">
          唯一需要单独记的是<strong>零声母</strong>（没有声母、直接以 a/e/o 开头的音节），见下表。
        </p>
      </section>

      <section>
        <h3>韵母都在哪个键</h3>
        <div class="finals">
          <span v-for="item in finalTable" :key="item.letter" class="cell">
            <kbd>{{ item.letter }}</kbd>
            <span class="f">{{ item.finals }}</span>
          </span>
        </div>
      </section>

      <section class="figures">
        <KeyMap :scheme="scheme" :hint="false" />
        <ZeroInitialTable :scheme="scheme" />
      </section>

      <section>
        <h3>怎么练比较快</h3>
        <ul class="tips">
          <li>先用「键位记忆训练」把韵母和键的对应背下来，这一步过了之后速度会突然快很多。</li>
          <li>然后练「全部拼音组合」，把 405 个音节的组合练熟。</li>
          <li>最后用「常用汉字」和「词组 / 句子」过渡到真实打字——单字熟了不等于打字快。</li>
          <li>卡住 3 秒会自动闪键位（提示过的题不计入独立正确率），想直接看答案按 <kbd>Tab</kbd>。</li>
          <li>每次练完点「结束本轮并结算」，看「反应最慢的键」——那几个键就是下一步要重点练的。</li>
        </ul>
      </section>

      <footer>
        <span class="about">键位表已用官方小鹤码表逐字交叉验证（7701 字一致率 99.65%）</span>
        <button class="btn primary" type="button" @click="closePanel()">开始练</button>
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
  padding: 20px;
  background: rgba(16, 20, 26, 0.42);
  backdrop-filter: blur(2px);
}

.card {
  width: min(880px, 100%);
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
}

.rules {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.9;
  color: var(--text-dim);
}

.rules strong {
  color: var(--text);
}

code {
  font-family: var(--mono);
  font-size: 12.5px;
  padding: 1px 5px;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 3px;
}

.note {
  margin: 8px 0 0;
  font-size: 12.5px;
  color: var(--text-dim);
}

.note strong {
  color: var(--text);
}

.finals {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
}

.cell {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  font-size: 12.5px;
}

.cell .f {
  color: var(--text-dim);
}

.figures {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.tips {
  margin: 0;
  padding-left: 18px;
  font-size: 12.5px;
  line-height: 1.9;
  color: var(--text-dim);
}

kbd {
  font-family: var(--mono);
  font-size: 11.5px;
  padding: 1px 5px;
  color: var(--text);
  background: var(--panel-soft);
  border: 1px solid var(--border-strong);
  border-radius: 3px;
}

footer {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.about {
  flex: 1;
  font-size: 11.5px;
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
