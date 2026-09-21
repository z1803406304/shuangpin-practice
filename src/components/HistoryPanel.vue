<script setup lang="ts">
/** 历史记录面板：汇总 + 速度曲线 + 记录列表 + 导入/导出/清空 */
import { computed, ref } from 'vue'

import { aggregateKeyErrors, formatDuration, formatTime, summarize, type SessionRecord } from '../core/history.ts'
import { codeToLetter } from '../core/keys.ts'
import { getScheme } from '../core/schemes/index.ts'
import {
  applyImport,
  clearHistory,
  downloadHistory,
  parseImport,
  readTextFile,
  records,
  removeRecord,
  type ImportMode,
  type ParsedImport,
} from '../stores/history.ts'
import { settings } from '../stores/settings.ts'
import { closePanel } from '../stores/ui.ts'
import HeatmapLegend from './HeatmapLegend.vue'
import KeyMap from './KeyMap.vue'
import Sparkline from './Sparkline.vue'

const summary = computed(() => summarize(records.value))

/** 速度曲线：取最近 30 次，按时间正序（records[0] 是最新的，所以要反过来） */
const curve = computed(() => [...records.value].slice(0, 30).reverse().map((r) => r.cpm))

const confirmingClear = ref(false)

/** 所有历史轮次里靠提示完成的题数合计 */
const hintedTotal = computed(() => records.value.reduce((sum, r) => sum + r.hinted, 0))

/* ── 历史错误热力图 ── */
type Scope = 'all' | 'recent30' | 'recent10' | 'selected'
const scope = ref<Scope>('all')
const selectedId = ref<string | null>(null)

const selectedRecord = computed<SessionRecord | null>(
  () => records.value.find((r) => r.id === selectedId.value) ?? null,
)

/** 热力图统计范围：全部历史 / 最近若干轮 / 表格里点中的那一轮 */
const scopedRecords = computed<readonly SessionRecord[]>(() => {
  if (scope.value === 'selected' && selectedRecord.value) return [selectedRecord.value]
  if (scope.value === 'recent30') return records.value.slice(0, 30)
  if (scope.value === 'recent10') return records.value.slice(0, 10)
  return records.value
})

const heatmap = computed(() => aggregateKeyErrors(scopedRecords.value))
const scheme = computed(() => getScheme(settings.schemeId))
const maxKeyCount = computed(() => Math.max(1, ...heatmap.value.top.map((t) => t.count)))

const scopeNote = computed(() => {
  if (scope.value === 'selected' && selectedRecord.value) {
    const index = records.value.indexOf(selectedRecord.value)
    return `第 ${records.value.length - index} 轮（${formatTime(selectedRecord.value.endedAt)}）`
  }
  return `${scopedRecords.value.length} 轮`
})

/** 点表格行切换「只看这一轮」；再点一次取消 */
function selectRound(record: SessionRecord): void {
  if (selectedId.value === record.id) {
    selectedId.value = null
    scope.value = 'all'
    return
  }
  selectedId.value = record.id
  scope.value = 'selected'
}

function onScopeChange(): void {
  if (scope.value !== 'selected') selectedId.value = null
}

/* ── 导入 ── */
const fileInput = ref<HTMLInputElement | null>(null)
/** 已解析、等待用户确认的导入内容 */
const pendingImport = ref<ParsedImport | null>(null)
const importMessage = ref('')
const importOk = ref(false)

/** 待导入记录的时间范围，让用户确认是不是自己要的那份 */
const pendingRange = computed(() => {
  const list = pendingImport.value?.records
  if (!list || list.length === 0) return ''
  const times = list.map((r) => r.endedAt).sort((a, b) => a - b)
  return `${formatTime(times[0])} ～ ${formatTime(times[times.length - 1])}`
})

function pickFile(): void {
  importMessage.value = ''
  fileInput.value?.click()
}

async function onFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // 清空 value，否则连续选同一个文件不会再触发 change
  input.value = ''
  if (!file) return
  importMessage.value = ''
  try {
    const text = await readTextFile(file)
    const parsed = parseImport(text)
    if (parsed.records.length === 0) {
      importOk.value = false
      importMessage.value =
        `「${file.name}」里没有可用的练习记录` +
        (parsed.invalid > 0 ? `（${parsed.invalid} 条数据不完整）` : '')
      return
    }
    pendingImport.value = parsed
  } catch (error) {
    importOk.value = false
    importMessage.value = `读取失败：${error instanceof Error ? error.message : String(error)}`
  }
}

function confirmImport(mode: ImportMode): void {
  const parsed = pendingImport.value
  if (!parsed) return
  const result = applyImport(parsed, mode)
  pendingImport.value = null
  importOk.value = result.ok
  if (!result.ok) {
    importMessage.value = result.message
    return
  }
  const parts = [`已导入 ${result.added} 条`]
  if (result.skipped > 0) parts.push(`跳过 ${result.skipped} 条重复`)
  if (result.dropped > 0) parts.push(`超出 ${200} 条上限丢弃 ${result.dropped} 条`)
  parts.push(`现有 ${result.total} 条`)
  importMessage.value = parts.join('，')
}

function cancelImport(): void {
  pendingImport.value = null
}

function doClear(): void {
  clearHistory()
  confirmingClear.value = false
  importMessage.value = ''
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}
</script>

<template>
  <div class="overlay" @click.self="closePanel()">
    <div class="card">
      <header>
        <h2>历史记录</h2>
        <span class="meta">共 {{ summary.sessions }} 轮 · 数据只存在本机浏览器（localStorage）</span>
        <button class="close" type="button" title="关闭（Esc）" @click="closePanel()">✕</button>
      </header>

      <template v-if="records.length">
        <div class="metrics">
          <div class="metric">
            <span class="value">{{ summary.sessions }}</span>
            <span class="label">练习轮数</span>
          </div>
          <div class="metric">
            <span class="value">{{ summary.totalDone }}</span>
            <span class="label">累计题数</span>
          </div>
          <div class="metric">
            <span class="value">{{ formatDuration(summary.totalMs) }}</span>
            <span class="label">累计时长</span>
          </div>
          <div class="metric">
            <span class="value">{{ summary.avgCpm.toFixed(0) }}</span>
            <span class="label">平均字/分</span>
          </div>
          <div class="metric">
            <span class="value">{{ summary.bestCpm.toFixed(0) }}</span>
            <span class="label">最好字/分</span>
          </div>
          <div class="metric">
            <span class="value">{{ pct(summary.avgIndependentRate) }}</span>
            <span class="label">平均独立正确率</span>
          </div>
          <div class="metric">
            <span class="value">{{ hintedTotal }}</span>
            <span class="label">依赖提示题数</span>
          </div>
        </div>

        <section class="curve">
          <h3>速度曲线 <span class="sub">最近 {{ curve.length }} 轮（字/分）</span></h3>
          <Sparkline :values="curve" unit=" 字/分" />
        </section>

        <section class="heat">
          <h3>
            错误热力图
            <span class="sub">
              累计 {{ heatmap.total }} 次错误击键 · 涉及 {{ heatmap.keys }} 个键 · 统计范围
              {{ scopeNote }}
            </span>
          </h3>

          <div class="heat-head">
            <label class="scope">
              <span>范围</span>
              <select v-model="scope" @change="onScopeChange">
                <option value="all">全部历史（{{ records.length }} 轮）</option>
                <option value="recent30">最近 30 轮</option>
                <option value="recent10">最近 10 轮</option>
                <option v-if="selectedRecord" value="selected">选中的那一轮</option>
              </select>
            </label>
            <div class="top-keys">
              <span v-for="item in heatmap.top" :key="item.key" class="top-key">
                <kbd>{{ codeToLetter(item.key) }}</kbd>
                <span class="track"><i :style="{ width: `${(item.count / maxKeyCount) * 100}%` }" /></span>
                <span class="count">{{ item.count }}</span>
              </span>
              <span v-if="heatmap.top.length === 0" class="empty-inline">这段时间没有按错的键。</span>
            </div>
          </div>

          <div class="heat-body">
            <div class="heat-map">
              <KeyMap :scheme="scheme" :key-errors="heatmap.errors" heatmap />
            </div>
            <HeatmapLegend v-if="heatmap.total > 0" :key-errors="heatmap.errors" scope-label="范围内" />
          </div>

          <p class="heat-note">
            单轮数据噪声大，看累计更能说明问题。点下面表格里的任意一行可以只看那一轮。
          </p>
        </section>

        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>模式</th>
              <th class="num">题数</th>
              <th class="num">字/分</th>
              <th class="num">独立正确率</th>
              <th class="num">依赖提示</th>
              <th class="num">用时</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="record in records"
              :key="record.id"
              :class="{ picked: record.id === selectedId }"
              :title="record.id === selectedId ? '再点一次取消选择' : '点一下只看这一轮的热力图'"
              @click="selectRound(record)"
            >
              <td class="dim">{{ formatTime(record.endedAt) }}</td>
              <td>{{ record.modeName }}</td>
              <td class="num">{{ record.done }}</td>
              <td class="num strong">{{ record.cpm.toFixed(0) }}</td>
              <td class="num">{{ pct(record.independentRate) }}</td>
              <td class="num dim">{{ record.hinted > 0 ? `${record.hinted} 题` : '—' }}</td>
              <td class="num dim">{{ formatDuration(record.elapsedMs) }}</td>
              <td class="row-action">
                <button type="button" title="删除这条记录" @click.stop="removeRecord(record.id)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
      </template>

      <p v-else class="empty">
        还没有历史记录。练够 3 题后点「结束本轮并结算」，或者直接关掉页面也会自动保存。<br />
        之前在别的浏览器练过？用下面的「导入 JSON」把之前导出的记录导回来。
      </p>

      <footer>
        <!-- 第 1 步：导入前先让用户确认，避免误操作删掉已有数据 -->
        <template v-if="pendingImport">
          <span class="warn">
            找到 <strong>{{ pendingImport.records.length }}</strong> 条记录（{{ pendingRange }}）
            <template v-if="pendingImport.invalid > 0">，另有 {{ pendingImport.invalid }} 条数据不完整会被忽略</template>
          </span>
          <button class="btn" type="button" @click="cancelImport()">取消</button>
          <button class="btn danger" type="button" title="删除当前全部记录，换成文件里的" @click="confirmImport('replace')">
            替换全部
          </button>
          <button class="btn primary" type="button" title="保留当前记录，把文件里的并进来" @click="confirmImport('merge')">
            合并导入
          </button>
        </template>

        <!-- 第 2 步：清空确认 -->
        <template v-else-if="confirmingClear">
          <span class="warn">确定要清空全部历史记录吗？此操作不可撤销。</span>
          <button class="btn" type="button" @click="confirmingClear = false">取消</button>
          <button class="btn danger" type="button" @click="doClear()">确定清空</button>
        </template>

        <template v-else>
          <span class="msg" :class="{ ok: importOk, bad: importMessage && !importOk }">{{ importMessage }}</span>
          <span class="spacer" />
          <button class="btn" type="button" @click="pickFile()">导入 JSON</button>
          <button class="btn" type="button" :disabled="!records.length" @click="downloadHistory()">导出 JSON</button>
          <button class="btn" type="button" :disabled="!records.length" @click="confirmingClear = true">清空历史</button>
          <button class="btn primary" type="button" @click="closePanel()">关闭</button>
        </template>
      </footer>

      <input
        ref="fileInput"
        class="file-input"
        type="file"
        accept=".json,application/json"
        @change="onFileChosen"
      />
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
  width: min(920px, 100%);
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

.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 10px 8px;
  padding: 14px 0 6px;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: center;
}

.metric .value {
  font-family: var(--mono);
  font-size: 19px;
  font-weight: 600;
}

.metric .label {
  font-size: 11.5px;
  color: var(--text-dim);
}

.curve {
  padding: 6px 0 12px;
}

/* ── 历史错误热力图 ── */
.heat {
  padding: 4px 0 12px;
  border-top: 1px dashed var(--border);
  margin-top: 2px;
}

.heat-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 18px;
  margin-bottom: 8px;
}

.scope {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--text-dim);
}

.scope select {
  font-family: inherit;
  font-size: 12.5px;
  padding: 2px 4px;
  color: var(--text);
  background: var(--panel-soft);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  outline: none;
}

.top-keys {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px 14px;
}

.top-key {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.track {
  width: 52px;
  height: 7px;
  background: var(--slot);
  border-radius: 4px;
  overflow: hidden;
}

.track i {
  display: block;
  height: 100%;
  background: var(--danger);
  opacity: 0.75;
  border-radius: 4px;
}

.count {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-dim);
}

.empty-inline {
  font-size: 12px;
  color: var(--text-faint);
}

.heat-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

/* 只读展示：这里的键位图不接受点击 */
.heat-map {
  pointer-events: none;
}

.heat-note {
  margin: 8px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-faint);
  text-align: center;
}

kbd {
  font-family: var(--mono);
  font-size: 11px;
  padding: 1px 5px;
  color: var(--text);
  background: var(--panel-soft);
  border: 1px solid var(--border-strong);
  border-radius: 3px;
}

tbody tr {
  cursor: pointer;
}

tbody tr:hover {
  background: var(--panel-soft);
}

tbody tr.picked {
  background: var(--accent-soft);
}

tbody tr.picked td {
  border-bottom-color: var(--accent);
}

h3 {
  margin: 0 0 6px;
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

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

th {
  text-align: left;
  font-weight: 500;
  color: var(--text-dim);
  padding: 5px 6px;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--panel);
}

td {
  padding: 5px 6px;
  border-bottom: 1px solid var(--border);
}

.num {
  text-align: right;
}

.strong {
  font-family: var(--mono);
  font-weight: 600;
}

.dim {
  color: var(--text-dim);
}

.row-action {
  width: 26px;
  text-align: right;
}

.row-action button {
  background: none;
  border: none;
  color: var(--text-faint);
  cursor: pointer;
  font-size: 11px;
}

.row-action button:hover {
  color: var(--danger);
}

.empty {
  padding: 26px 0;
  text-align: center;
  color: var(--text-faint);
  font-size: 13px;
  line-height: 1.9;
}

footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.spacer {
  flex: 1;
}

.msg {
  flex: 1;
  min-width: 120px;
  font-size: 12px;
  color: var(--text-faint);
}

.msg.ok {
  color: var(--ok);
}

.msg.bad {
  color: var(--danger);
}

.warn {
  flex: 1;
  min-width: 160px;
  font-size: 12.5px;
  color: var(--danger);
}

.warn strong {
  font-family: var(--mono);
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

.btn.danger {
  border-color: var(--danger);
  color: var(--danger);
}

/* 文件选择框只作为触发入口，界面上不显示原生控件 */
.file-input {
  display: none;
}
</style>
