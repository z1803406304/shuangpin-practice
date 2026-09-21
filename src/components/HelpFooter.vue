<script setup lang="ts">
/** 底部说明：把操作方式讲清楚（版本 / 验证信息在「更多设置」里） */
</script>

<template>
  <footer class="help">
    <ol>
      <li>切换到系统自带的<strong>英文输入法</strong>（本页直接捕获按键，不需要点输入框）</li>
      <li><kbd>空格</kbd> 开始 / 继续 · <kbd>Esc</kbd> 暂停（切走标签页也会自动暂停）</li>
      <li><kbd>空格</kbd> / <kbd>回车</kbd>：本题已完成则<strong>下一题</strong>，未完成则<strong>清空重打</strong></li>
      <li><kbd>Tab</kbd>：显示答案（同一个编码可能对应多个音节）· <kbd>Backspace</kbd>：回退一键</li>
      <li>严格模式下按错会清空本题重打；可在顶栏关掉，改成「错了也继续」</li>
      <li><strong>卡住 3 秒</strong>会在键位图上闪烁该按的键（可在「更多设置」里调时间或关掉）</li>
      <li>提示过的题<strong>不计入独立正确率</strong>，会单独统计「依赖提示」</li>
      <li><strong>结束本轮并结算</strong>：看成绩单（最常按错的键 / 最容易错的字 / 反应最慢的键）</li>
      <li><strong>错误热力图</strong>：把本条按错的键着色到键位图上；历史记录存在本机，可导出 JSON</li>
      <li>手机也可以用：直接<strong>点键位图</strong>输入</li>
    </ol>
  </footer>
</template>

<style scoped>
.help {
  padding: 8px 16px 12px;
  border-top: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 12.5px;
}

ol {
  margin: 0 auto;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 3px 20px;
}

li {
  display: flex;
  gap: 4px;
  align-items: baseline;
}

li::before {
  content: counter(list-item);
  color: var(--text-faint);
  font-family: var(--mono);
  font-size: 11px;
}

ol {
  counter-reset: list-item;
}

li {
  counter-increment: list-item;
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

strong {
  color: var(--text);
  font-weight: 600;
}
</style>
