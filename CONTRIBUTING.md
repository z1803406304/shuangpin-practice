# 贡献指南

## 环境

- Node.js >= 22.18（测试是 `.mjs` 直接 import `.ts` 源码，依赖 Node 原生的类型剥离）
- 开发与 CI 使用 Node 24
- Windows / PowerShell：默认执行策略为 `Restricted`，会阻止 `npm` 执行脚本。
  用 `npm.cmd` 代替，或执行一次 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

```bash
git clone https://github.com/z1803406304/shuangpin-practice.git
cd shuangpin-practice
npm install
npm run dev          # → http://localhost:5273/
```

## 命令

| 命令 | 作用 |
| --- | --- |
| `npm test` | 全部单测（81 个，纯 Node，不需要浏览器） |
| `npm run typecheck` | `vue-tsc --noEmit` |
| `npm run build` | 构建到 `dist/` |
| `npm run build:offline` | 打包成可双击的单文件 HTML（含自检） |
| `npm run release` | 生成 `release/` 便携包（单文件 HTML + zip） |
| `npm run gen:all` | 重新生成音节表 / 常用字 / 词库 / 语料（首次会自动下载数据源） |
| `npm run verify:flypy` | 用官方小鹤码表交叉验证编码器 |
| `npm run verify:file` | 用无头浏览器在真实 `file://` 下验证离线包（19 项） |
| `npm run make:screenshot` | 重新生成 README 截图（需先 `npm run dev`） |
| `npm run publish:github` | 发布 Release 到 GitHub（需要 `GITHUB_TOKEN`，支持 `--dry`） |

## 代码约定

**1. `src/core/` 保持纯函数。**
不引入 DOM、Vue、`localStorage` 和第三方库。需要读写浏览器状态就放 `stores/`，
出题逻辑放 `generators/`。这样正确性核心可以在 Node 里直接测试。

**2. `src/data/*.ts` 是生成产物，不要直接编辑。**
改语料改 `corpus/sentences.txt`，改筛选规则改 `scripts/*.mjs`，然后跑 `npm run gen:all`。

**3. 改动要配套测试。**

| 改动范围 | 测试文件 |
| --- | --- |
| 键位表 / 编码器 | `tests/encode.test.mjs`，并跑 `npm run verify:flypy` |
| 题库 / 生成脚本 | `tests/data.test.mjs` |
| 出题器 | `tests/generators.test.mjs` |
| 判定 / 统计 / 历史 / 状态机 | 对应 `tests/*.test.mjs` |

测试里的时间参数一律显式传入（`hit('KeyA', 1500)`），不要依赖 `Date.now()`。

**4. 文本文件统一 UTF-8**（`.editorconfig` 已声明）。用 PowerShell 处理含中文的文件时注意：

- 不要用 `Get-Content` / `Set-Content` 批量改写：往返时会按控制台编码解码，中文会损坏
- 重定向子进程输出前先设置 `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`
- 用命令行参数传递中文字符串不可靠，需要匹配中文时改用其他特征（例如对应的拼音串）

**5. 提交信息用 Conventional Commits**，中文描述即可：

```
feat: 增加开始/暂停状态机
fix: 修复自定义文本导入时标点导致音节错位
docs: 补充题库筛选说明
test: 补 aggregateKeyErrors 的坏数据用例
```

## 加一套双拼方案

1. 在 `src/core/schemes/` 新建 `<id>.ts`，导出实现 `Scheme` 接口的对象
   （`keyRows` / `zeroInitial` / `encode`）。
2. 在 `src/core/schemes/index.ts` 的 `SCHEMES` 中注册。
3. `initialsOfKey()` 目前定义在 `xiaohe.ts`，`generators/drill.ts` 会调用它。
   新增方案时需要按方案拆分这个助手，否则键位训练的声母池会混用。
4. 为新方案找一份权威码表，参照 `scripts/verify-against-flypy.mjs` 写交叉验证脚本。
   编码器的正确性依赖这一步。

## 加一种练习模式

1. 在 `src/generators/` 实现 `createXxx(context): Generator`（`next()` / `reset()`）。
2. 在 `src/generators/index.ts` 的 `MODES` 中登记；需要额外设置项时填 `option`。
3. 界面层不需要改动：`Prompt` 的 `parts` + `layout` 已覆盖单字、词、句和单键题。

## 提交前自检

```bash
npm test && npm run typecheck && npm run build
```

改动涉及构建配置、产物内联逻辑或离线包结构时，再跑：

```bash
npm run release && npm run verify:file
```

`verify:file` 用无头浏览器打开真实的 `file://` 页面并跑完整流程，
能发现静态检查查不出的问题（产物语法正确但不渲染、启动状态变化等）。
