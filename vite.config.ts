import { readFileSync } from 'node:fs'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 版本号只在 package.json 里维护一份，通过 define 注入到界面
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig(({ mode }) => {
  // offline 模式：把整个应用打成单个 IIFE 文件，再内联进 HTML，
  // 这样双击就能打开（ES module 从 file:// 加载会被浏览器 CORS 拦掉）。
  const offline = mode === 'offline'

  return {
    // base:'./' 让资源引用都是相对路径
    base: './',
    plugins: [vue()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    build: offline
      ? {          outDir: 'dist-offline',
          assetsDir: '.',
          cssCodeSplit: false,
          // IIFE 里没有模块预加载；连 polyfill 一起关掉，避免它引用 import.meta
          modulePreload: { polyfill: false },
          // 内联后体积不重要，但要保证没有外部依赖
          assetsInlineLimit: 100000000,
          // 单文件版故意把所有东西塞在一起（含 pinyin-pro），600KB 是预期值
          chunkSizeWarningLimit: 2000,
          rollupOptions: {
            output: {
              format: 'iife',
              inlineDynamicImports: true,
              entryFileNames: 'app.js',
              assetFileNames: 'app.[ext]',
            },
            onwarn(warning, warn) {
              // IIFE 输出里 Vite 的 preload 辅助代码引用了 import.meta，会被替换成 {}。
              // 我们已经关掉预加载、又把动态 import 全部内联，这段是死代码，警告没有意义。
              if (warning.code === 'EMPTY_IMPORT_META') return
              warn(warning)
            },
          },
        }
      : {
          /**
           * 主包约 570KB（gzip 约 190KB），其中约 2/3 是**故意打进包的题库数据**
           * （405 音节 + 3500 常用字 + 12000 词语 + 65 条句子）。
           *
           * 这个体积对「本地运行」的用法没有影响（dev server 或 file:// 都是瞬间加载，
           * 解析 570KB JS 也就几十毫秒），所以默认不拆包 —— 拆包的代价是切换模式时
           * 要等一次异步加载，而收益为零。
           *
           * 如果以后要把这个应用挂到网站上，杠杆是明确的：把 data/words.ts 这类大语料
           * 改成按需 `import()`（用 stores/corpora.ts 缓存），主包能回到约 70KB gzip。
           * 所以这里调高告警阈值，并留下这条说明，而不是让告警一直挂着。
           */
          chunkSizeWarningLimit: 800,
        },
    server: {
      port: 5273,
      strictPort: true,
      watch: {
        // 编辑器/工具做原子写时会先建 .xxx.tmpdir/，chokidar 去 watch 这些临时文件
        // 会抛 EBUSY 把 dev server 直接搞崩，所以显式忽略掉
        ignored: ['**/.git/**', '**/node_modules/**', '**/.*.tmpdir/**', '**/*.tmp', '**/data-src/**'],
      },
    },
  }
})
