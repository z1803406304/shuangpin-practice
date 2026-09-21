/**
 * 一键补齐 GitHub 仓库的「门面」信息：
 *   1. 仓库描述与主页
 *   2. Topics（主题标签，影响被搜到的概率）
 *   3. 创建 v1.0.0 Release
 *   4. 把便携包（release/shuangpin-portable.zip）传上去作为附件
 *
 * 用法：
 *   1. 准备一个 token（见下方说明），设到环境变量 GITHUB_TOKEN
 *   2. npm run publish:github            # 真正执行
 *      npm run publish:github -- --dry    # 只看会做什么，不发任何请求
 *
 * ── 怎么生成 token ─────────────────────────────────────────
 * 方式 A（推荐，权限最小）：GitHub → Settings → Developer settings →
 *   Personal access tokens → Fine-grained tokens → Generate new token
 *   · Repository access: Only select repositories → shuangpin-practice
 *   · Permissions:
 *       Contents:      Read and write   （建 Release、传附件）
 *       Administration: Read and write  （改描述与主题）
 * 方式 B（省事）：Classic token，勾一个 `public_repo` 就够（对自己的公开仓库）。
 *
 * 脚本只读环境变量，不会把 token 写进任何文件。用完建议去 GitHub 撤销。
 * 重复执行是安全的：Release 已存在就更新，附件已存在就先删再传。
 */

const REPO = 'z1803406304/shuangpin-practice'
const TAG = 'v1.0.0'
const RELEASE_NAME = 'v1.0.0'
const ASSET_PATH = 'release/shuangpin-portable.zip'

const DESCRIPTION =
  '小鹤双拼打字练习系统：七种练习模式、卡住自动提示、开始与暂停、错误热力图与历史复盘、易错复习，可打包成离线单文件双击即用'

const TOPICS = [
  'shuangpin',
  'flypy',
  'xiaohe',
  'typing-practice',
  'chinese-input',
  '双拼',
  '小鹤双拼',
  '打字练习',
  'vue3',
  'vite',
  'typescript',
  'offline-first',
]

const NOTES = `## 主要特性

- **七种练习模式**：全部拼音组合 / 常用汉字 / 词组 / 句子短文 / 自定义文本 / 键位记忆训练 / 易错复习
- **卡住自动提示**：一个键想不出来，干等 3 秒就在键位图上闪该按的键；提示过的题不计入独立正确率
- **开始 / 暂停**：准备阶段与离开电脑时不计时、不计错、不误触发提示
- **错误热力图**：实时看本轮，历史面板看多轮累计（长期哪些键没记牢）
- **数据驱动的题库**：405 音节按真实字频加权、3500 常用字、12000 常用词、1200 四字词/成语
- **键盘布局无关**：用 \`KeyboardEvent.code\`（物理键位）判定，Dvorak 等布局也能用
- **无需后端**：所有数据都在仓库里，运行时不联网

## 怎么用（不用装 Node）

下载下面的 \`shuangpin-portable.zip\`，解压后**双击「双拼练习.html」**即可：

- 不需要安装、不需要服务器、不需要联网
- 换成 Chrome / Edge / Firefox / Safari 都行
- 手机上也能用（传文件用浏览器打开，或 \`npm run preview -- --host\` 后访问局域网地址）

## 想跑源码

\`\`\`bash
git clone https://github.com/${REPO}.git
cd shuangpin-practice
npm install
npm run dev          # → http://localhost:5273/
\`\`\`

需要 Node.js >= 22.18。

## 正确性

- 编码器经**小鹤官方码表**逐字交叉验证：7701 个单字一致率 **99.649%**
  （余下 27 处是生僻多音字的读音取舍差异，不是编码错误）
- 单测 **80/80**（编码器全量回归、题库质量、提示策略、统计、历史、出题器、状态机）
- 离线包在**真正的 \`file://\`** 下端到端验证 **19/19**（用无头浏览器跑完整流程）

## 数据来源

字频来自 Jun Da 现代汉语字频表（hanziDB，MIT），词频与词性来自 jieba 词典（MIT），
繁简去重用 opencc-js（MIT），拼音转换用 pinyin-pro（MIT）。
**小鹤官方码表仅用于开发期的交叉验证，不随包分发。**

## 许可证

[MIT](https://github.com/${REPO}/blob/main/LICENSE) © 2026 yummy
`

/* ──────────────────────────────────────────────────────── */

const dryRun = process.argv.includes('--dry') || process.argv.includes('--dry-run')
const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? ''

if (!token && !dryRun) {
  console.error('❌ 没有找到 GITHUB_TOKEN 环境变量。')
  console.error('')
  console.error('   PowerShell:  $env:GITHUB_TOKEN = "github_pat_xxx"; npm run publish:github')
  console.error('   bash:        GITHUB_TOKEN=github_pat_xxx npm run publish:github')
  console.error('')
  console.error('   token 生成方式见本文件顶部注释。想先看会做什么，加 -- --dry。')
  process.exit(1)
}

const api = 'https://api.github.com'
const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  'User-Agent': 'shuangpin-practice-publish',
}

async function call(method, url, body, extraHeaders = {}) {
  if (dryRun) {
    console.log(`   [dry] ${method} ${url}${body ? `  ${JSON.stringify(body).slice(0, 110)}` : ''}`)
    return { dry: true }
  }
  const res = await fetch(`${api}${url}`, {
    method,
    headers: { ...headers, ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) {
    const hint =
      res.status === 403 || res.status === 404
        ? '（权限不足：fine-grained token 需要 Contents: Read and write + Administration: Read and write）'
        : ''
    throw new Error(`${method} ${url} 失败：${res.status} ${text.slice(0, 200)} ${hint}`)
  }
  return json
}

function step(title) {
  console.log(`\n▶ ${title}`)
}

async function main() {
  const { readFileSync, existsSync, statSync } = await import('node:fs')
  const { resolve } = await import('node:path')

  console.log(dryRun ? '（dry-run：不会发任何请求）' : `仓库：${REPO}`)

  // 1) 描述与主页
  step('设置仓库描述')
  await call('PATCH', `/repos/${REPO}`, { description: DESCRIPTION, homepage: '' })
  console.log(`   描述：${DESCRIPTION.slice(0, 40)}…（共 ${DESCRIPTION.length} 字）`)

  // 2) Topics
  step('设置 Topics')
  try {
    await call('PUT', `/repos/${REPO}/topics`, { names: TOPICS })
    console.log(`   ${TOPICS.join(' · ')}`)
  } catch (error) {
    // GitHub 对 topic 的字符有校验（中文 topic 在部分账号/接口版本下会被拒）。
    // 这不是关键信息，失败就退回纯 ASCII 的，不要因此让整个脚本挂掉。
    console.log(`   ⚠️ 完整列表被拒（${String(error.message).slice(0, 80)}…），改用纯英文 topic`)
    const ascii = TOPICS.filter((t) => /^[a-z0-9-]+$/.test(t))
    await call('PUT', `/repos/${REPO}/topics`, { names: ascii })
    console.log(`   ${ascii.join(' · ')}`)
  }

  // 3) Release
  step(`创建或更新 Release ${TAG}`)
  let release = null
  if (dryRun) {
    console.log('   [dry] 若该 tag 的 Release 已存在则更新说明，否则新建（tag 指向 main）')
    release = { id: 0, assets: [] }
  } else {
    try {
      release = await call('GET', `/repos/${REPO}/releases/tags/${TAG}`)
      console.log('   已存在，改为更新说明')
      release = await call('PATCH', `/repos/${REPO}/releases/${release.id}`, { name: RELEASE_NAME, body: NOTES })
    } catch {
      release = await call('POST', `/repos/${REPO}/releases`, {
        tag_name: TAG,
        target_commitish: 'main',
        name: RELEASE_NAME,
        body: NOTES,
        draft: false,
        prerelease: false,
      })
      console.log('   已创建')
    }
  }

  // 4) 附件
  step('上传便携包')
  const assetPath = resolve(import.meta.dirname, '..', ASSET_PATH)
  if (!existsSync(assetPath)) {
    console.log(`   ⚠️ 找不到 ${ASSET_PATH}，跳过。先跑：npm run release`)
  } else {
    const size = statSync(assetPath).size
    console.log(`   文件：${ASSET_PATH}（${(size / 1024).toFixed(0)} KB）`)
    const name = 'shuangpin-portable.zip'

    if (!dryRun) {
      const existing = (release?.assets ?? []).find((a) => a.name === name)
      if (existing) {
        await call('DELETE', `/repos/${REPO}/releases/assets/${existing.id}`)
        console.log('   已删除同名旧附件')
      }
      const binary = readFileSync(assetPath)
      // 不要手写 Content-Length：undici 会根据 Buffer 自动算，手写反而可能不一致
      const res = await fetch(
        `https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/zip' },
          body: binary,
        },
      )
      if (!res.ok) throw new Error(`上传失败：${res.status} ${(await res.text()).slice(0, 200)}`)
      const info = await res.json()
      console.log(`   ✅ 已上传：${info.name}（${(info.size / 1024).toFixed(0)} KB）`)
      console.log(`   ${info.browser_download_url}`)
    } else {
      console.log('   [dry] 会删除同名旧附件并上传新附件')
    }
  }

  console.log('')
  if (dryRun) {
    console.log('（dry-run 结束，什么都没改。去掉 -- 后面的 --dry 就会真正执行。）')
  } else {
    console.log(`✅ 完成。去看看：https://github.com/${REPO}`)
    console.log(`   Release 页面：https://github.com/${REPO}/releases/tag/${TAG}`)
    console.log('   顺手把 token 撤销掉：https://github.com/settings/tokens')
  }
}

await main()
