/**
 * 生成「便携发布包」：一个可以直接拷到任何地方用的文件夹 + 一个 zip。
 *
 * 为什么同时放英文名和中文名两份 html：中文名对人友好，
 * 但某些老系统/命令行场景对非 ASCII 文件名不友好，所以两份都给。
 *
 * 运行：npm run release
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = resolve(ROOT, 'dist-offline/shuangpin-offline.html')
const RELEASE = resolve(ROOT, 'release')
const ZIP = resolve(RELEASE, 'shuangpin-portable.zip')

if (!existsSync(SOURCE)) {
  console.error('❌ 找不到离线包，先跑：npm run build:offline')
  process.exit(1)
}

const GUIDE = `双拼练习（小鹤双拼）· 便携版
================================

【怎么用】
双击「双拼练习.html」，用任意现代浏览器打开即可
（Chrome / Edge / Firefox / Safari 都行）。
不需要安装、不需要联网、不需要服务器。

【换电脑 / 发给别人】
直接把这个 html 文件拷过去就行（U 盘、网盘、微信传文件都可以），双击即用。
「shuangpin-practice.html」和「双拼练习.html」是同一份东西，随便用哪个。

【手机上用】
方式一：把 html 传到手机，在「文件」App 里选择用浏览器打开。
方式二（推荐）：在项目目录执行
        npm run preview -- --host
      然后手机浏览器访问终端里打印的局域网地址。

【数据存在哪】
练习记录和设置都存在这台浏览器的本地存储里，
换浏览器或清理浏览器数据会丢。
备份：在「历史记录」面板点「导出 JSON」，得到一个 json 文件。
换电脑：在新机器上点「导入 JSON」选中那个文件。
      「合并导入」不会覆盖已有记录，而且同一份文件导入两次也不会重复。

【怎么练】
1. 按空格开始（页面加载后是「未开始」状态：题面和键位图先显示出来，
   你先切好英文输入法，这期间的误触不会被记成错误）
2. 空格 / 回车：本题完成则进下一题，没完成则清空重打
3. Tab：显示答案；Backspace：退一格
4. Esc 暂停（切走标签页或长时间没输入也会自动暂停，暂停期间不计入成绩）
5. 卡住 3 秒会在键位图上自动闪烁该按的键（提示过的题不计入独立正确率）
6. 建议路线：
   键位记忆训练 → 全部拼音组合 → 常用汉字 → 词组 / 句子 → 易错复习
   词组模式可以在顶栏调「词库范围」：从最常用 1000 词开始，
   熟练后再放到 3000 / 6000 / 全部（12000 词）；
   想专门练节奏就选「四字词 / 成语」（1200 条）
7. 每轮练完点「结束本轮并结算」，看「反应最慢的键」—— 那就是下一步该重点练的

【关于正确性】
小鹤双拼键位表已用官方码表逐字交叉验证：7701 个单字一致率 99.649%
（剩下 27 处是生僻多音字的读音取舍差异，不是编码错误）。
`

rmSync(RELEASE, { recursive: true, force: true })
mkdirSync(RELEASE, { recursive: true })

copyFileSync(SOURCE, resolve(RELEASE, '双拼练习.html'))
copyFileSync(SOURCE, resolve(RELEASE, 'shuangpin-practice.html'))
writeFileSync(resolve(RELEASE, '使用说明.txt'), GUIDE, 'utf8')

/**
 * 打 zip。Node 没有内置 zip，所以按平台找工具：
 * Windows 用 PowerShell 的 Compress-Archive，Linux/macOS 用 zip 命令。
 * 都找不到就只产出 HTML —— 压缩包不是必需品，不该因此让整个脚本失败。
 */
function makeZip(dir, zipPath) {
  const names = readdirSync(dir)
  const attempts = [
    {
      label: 'PowerShell Compress-Archive',
      run: () =>
        execFileSync(
          'powershell.exe',
          ['-NoProfile', '-Command', `Compress-Archive -Path "${dir}\\*" -DestinationPath "${zipPath}" -Force`],
          { stdio: 'ignore' },
        ),
    },
    {
      label: 'zip',
      run: () => execFileSync('zip', ['-q', '-r', zipPath, ...names], { cwd: dir, stdio: 'ignore' }),
    },
  ]
  for (const attempt of attempts) {
    try {
      attempt.run()
      return attempt.label
    } catch {
      /* 换下一个 */
    }
  }
  return null
}

// 用 PowerShell 打 zip（Node 没有内置 zip）。
// 路径里的通配符交给 PowerShell 展开，命令串本身保持 ASCII，避免编码问题。
const zipTool = makeZip(RELEASE, ZIP)

const files = readdirSync(RELEASE).sort()
const kb = (path) => `${Math.round(statSync(path).size / 1024)} KB`
console.log('✅ 便携发布包已生成：release/')
for (const name of files) {
  console.log(`   ${name.padEnd(28)} ${kb(resolve(RELEASE, name))}`)
}
if (!zipTool) {
  console.log('')
  console.log('   ℹ️  没找到打包工具（Windows 的 PowerShell 或 Linux 的 zip），zip 已跳过。')
  console.log('      单文件 HTML 已经生成好了，需要压缩包就手动压一下。')
}
console.log('')
console.log('   用法：把整个 release 文件夹（或那个 zip）拷到任何地方，')
console.log('        双击「双拼练习.html」即可，无需安装、无需联网。')
