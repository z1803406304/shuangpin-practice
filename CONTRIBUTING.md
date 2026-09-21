# 贡献指南

感谢愿意一起改进这个项目。这个仓库有几条明确的约定，遵守它们能让改动更容易被合并。

## 环境要求

- **Node.js >= 22.18**（需要原生 TypeScript 类型剥离：测试是 `.mjs` 直接 import `.ts` 源码）
- 开发与 CI 使用的是 **Node 24**
- **Windows / PowerShell**：默认执行策略是 `Restricted`，直接敲 `npm` 会报
  「无法加载文件 npm.ps1」。用 `npm.cmd` 代替，或者
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` 一次性放开（本地脚本放行、
  网上下载的脚本仍需签名，是开发者常用的设置）。

```bash
git clone https://github.com/z1803406304/shuangpin-practice.git
cd shuangpin-practice
npm install
npm run dev          # → http://localhost:5273/
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm test` | 全部单测（81 个，纯 Node，不需要浏览器） |
| `npm run typecheck` | `vue-tsc --noEmit` |
| `npm run build` | 构建到 `dist/` |
| `npm run build:offline` | 打包成可双击的单文件 HTML（含自检） |
| `npm run gen:all` | 重新生成音节表/常用字/词库/句子（首次会自动下载数据源） |
| `npm run verify:flypy` | 用官方小鹤码表交叉验证编码器 |
| `npm run verify:file` | 用无头浏览器在真 `file://` 下验证离线包（19 项） |
| `npm run make:screenshot` | 重新生成 README 截图（需要先 `npm run dev`） |

## 项目约定

### 1. `src/core/` 必须保持纯函数

`core/` 里不出现 DOM、Vue、`localStorage`，也不 import 第三方库（`pinyin-pro` 只在生成脚本和
「自定义文本」的按需加载里用）。这样整个正确性核心可以在 Node 里直接跑测试。

要读写浏览器状态，就放到 `stores/`；要出题，就放到 `generators/`。

### 2. 不要手改生成产物

`src/data/*.ts` 由 `scripts/*.mjs` 生成，文件头也写了警告。要改内容就改脚本，
或者改 `corpus/sentences.txt`（句子语料是手写的源文件），然后 `npm run gen:all`。

### 3. 改动必须带测试

| 改动范围 | 需要的测试 |
| --- | --- |
| 键位表 / 编码器 | `tests/encode.test.mjs` 加权威用例，并跑 `npm run verify:flypy` |
| 题库 / 生成脚本 | `tests/data.test.mjs`（条数、编码自洽、质量不变量） |
| 出题器 | `tests/generators.test.mjs`（结构合法性 + 范围生效） |
| 判定 / 统计 / 历史 / 状态机 | 对应 `tests/*.test.mjs` |

**测试请传显式时间戳**（`hit('KeyA', 1500)`）而不是依赖真实时钟，否则会出现偶发失败。
这方面踩过坑：曾经用 `0` 当「还没发生」的哨兵，而 `0` 是合法时间戳，
导致第一击的反应时间丢失——用显式时间戳写测试时立刻暴露了。

### 4. 涉及中文文本的读写要小心编码

这是这个项目最容易踩的坑（踩过三次）：

- **不要用 PowerShell 的 `Get-Content` / `Set-Content` 批量改含中文的文件** ——
  往返时 UTF-8 会被按控制台编码（GBK）解读，中文注释和字符串全部损坏。
  用编辑器或文件工具改。
- 重定向子进程输出时先设 `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`，
  否则 Node 输出的中文会变乱码。
- 所有文本文件统一 UTF-8（`.editorconfig` 已声明）。

### 5. 提交信息

用约定式提交（Conventional Commits），中文描述即可：

```
feat: 增加开始/暂停状态机
fix: 修复自定义文本导入时标点导致音节错位
docs: 补充题库筛选说明
test: 补 aggregateKeyErrors 的坏数据用例
```

## 想加一套双拼方案？

1. 在 `src/core/schemes/` 新建 `<id>.ts`，导出实现 `Scheme` 的对象
   （`keyRows` / `zeroInitial` / `encode`）。
2. 在 `src/core/schemes/index.ts` 的 `SCHEMES` 里注册。
3. **注意**：`initialsOfKey()` 目前写在 `xiaohe.ts` 里（`generators/drill.ts` 会用它）。
   加方案时要把这个助手按方案拆开，否则键位训练的声母池会串。
4. 补测试：官方码表交叉验证的脚本 (`verify-against-flypy.mjs`) 是针对小鹤的，
   新方案需要各自找权威码表来验证——**这是这个项目唯一真正的正确性保障**。

## 想加一种练习模式？

1. 在 `src/generators/` 写一个 `createXxx(context): Generator`，实现 `next()` / `reset()`。
2. 在 `src/generators/index.ts` 的 `MODES` 里登记（可选 `option` 指定顶栏要显示的设置项）。
3. 界面层不用动——`Prompt` 的结构（`parts` + `layout`）已经能表达单字、词、句、单键题。

## 提交前自检

```bash
npm test && npm run typecheck && npm run build
```

动到了构建配置、产物内联逻辑或离线包结构时，请额外跑：

```bash
npm run release && npm run verify:file
```

`verify:file` 是行为回归网：它曾经抓到过「静态检查全过但页面白屏」的两个坑
（`String.replace` 替换串里的 `$` 把 HTML 注入了 JS；classic script 放在 `<head>` 里
在 `#app` 存在之前就执行），也抓到过「加开始/暂停后启动状态变了」这种影响面很大的改动。
