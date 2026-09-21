/**
 * 把 dist-offline 的 JS / CSS 内联进一个 HTML，产出可以**双击打开**的单文件版。
 *
 * 为什么需要这一步：浏览器不允许从 file:// 加载 ES module（CORS），
 * 而 Vite 默认产物就是 module。所以 offline 模式先用 IIFE 格式打包成一个 JS，
 * 再由这个脚本塞进 `<script>` 标签里 —— 没有模块、没有外部请求，双击就能用。
 *
 * 顺带做静态自检：如果产物里还残留 type="module" / import / export / import.meta，
 * 那 file:// 打开一定会失败，这里直接报出来而不是等用户发现。
 *
 * 运行：npm run build:offline
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = resolve(ROOT, 'dist-offline')

if (!existsSync(DIR)) {
  console.error('❌ 找不到 dist-offline，先跑 vite build --mode offline')
  process.exit(1)
}

const files = readdirSync(DIR)
const htmlFile = files.find((f) => f.endsWith('.html'))
const jsFile = files.find((f) => f.endsWith('.js'))
const cssFile = files.find((f) => f.endsWith('.css'))

if (!htmlFile || !jsFile) {
  console.error(`❌ 产物不完整：html=${htmlFile} js=${jsFile}`)
  process.exit(1)
}

const html = readFileSync(resolve(DIR, htmlFile), 'utf8')
// 防止 JS 里出现 </script> 把标签提前闭合
const js = readFileSync(resolve(DIR, jsFile), 'utf8').replace(/<\/script/gi, '<\\/script')
const css = cssFile ? readFileSync(resolve(DIR, cssFile), 'utf8') : ''

let out = html
  // 先把 <head> 里的外链 script 摘掉（稍后插到 </body> 前）
  .replace(/<script[^>]*src="[^"]*"[^>]*>\s*<\/script>/i, '')
  // ⚠️ 必须用**函数式替换**：替换串里 `$` 有特殊含义（$&、$`、$'、$1…），
  // Vue 的压缩代码里大量出现 `$`（$attrs、$el…），用字符串替换会把 HTML 片段
  // 注入进 JS，产物语法直接坏掉。这个坑踩过一次，故留注释。
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/i, () => (css ? `<style>\n${css}\n</style>` : ''))

// ⚠️ 内联脚本必须放在 </body> 前，不能留在 <head>：
// classic script（非 module）会**立刻同步执行**，此时 <div id="app"> 还没被解析出来，
// Vue 的 mount('#app') 找不到目标，只会打一条警告然后什么都不发生 —— 页面白屏。
// module script 天生 defer 所以没这个问题，但 file:// 用不了 module。
const scriptTag = `<script>\n${js}\n</script>`
out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, () => `${scriptTag}\n  </body>`) : `${out}\n${scriptTag}`

// 静态自检：这些都是 file:// 打不开的硬伤
const problems = []
if (/<script[^>]*type="module"/i.test(out)) problems.push('HTML 里还有 type="module" 的 script')
if (/<script[^>]*\ssrc=/i.test(out)) problems.push('HTML 里还有外链 script')
if (/<link[^>]*rel="stylesheet"/i.test(out)) problems.push('HTML 里还有外链样式')
if (/^\s*(import|export)\s/m.test(js)) problems.push('JS 里还有顶层 import / export 语句')
if (/\bimport\.meta\b/.test(js)) problems.push('JS 里还有 import.meta（IIFE 不支持）')
if (/\bimport\s*\(/.test(js)) problems.push('JS 里还有动态 import()')

// 脚本必须在 #app 之后，否则挂载时目标还不存在（白屏且不报错）
const appIndex = out.indexOf('id="app"')
const scriptIndex = out.indexOf('<script>')
if (appIndex < 0) problems.push('HTML 里找不到 id="app"')
else if (scriptIndex < appIndex) problems.push('内联脚本在 #app 之前，挂载会失败（白屏）')

// 最关键的一条：内联后的 JS 必须真的能被解析。
// 只检查字符串特征是不够的 —— 上面那个 `$` 替换坑就是「静态检查全过、页面白屏」。
try {
  // eslint-disable-next-line no-new-func
  new Function(js)
} catch (error) {
  problems.push(`内联后的 JS 解析失败：${error instanceof Error ? error.message : String(error)}`)
}

const target = resolve(DIR, '双拼练习-单文件版.html')
writeFileSync(target, out, 'utf8')
// 同时给一份纯英文名的，方便命令行 / file:// URL 里引用（中文名要转义）
writeFileSync(resolve(DIR, 'shuangpin-offline.html'), out, 'utf8')
const size = statSync(target).size

console.log(`✅ 已生成单文件版：${target}`)
console.log(`   体积：${(size / 1024).toFixed(0)} KB（含内联的 pinyin-pro，所以比普通构建大）`)
if (problems.length > 0) {
  console.error('❌ 自检未通过（这些会导致 file:// 打开失败）：')
  for (const p of problems) console.error(`   - ${p}`)
  process.exit(1)
}
console.log('   自检通过：无 type="module"、无外链、无 import/export/import.meta')
console.log('   双击这个文件即可离线使用（不需要服务器）')
