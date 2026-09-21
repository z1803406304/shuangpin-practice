/**
 * 验证离线单文件包在 **file://** 下真的能用。
 *
 * 为什么需要单独验证：内置浏览器工具只允许 http(s)，所以「双击打开」这件事
 * 之前只能靠静态自检推断。这个脚本用系统里的 Chrome/Edge 以无头模式打开
 * file:// 页面，再通过 DevTools 协议在真实页面里跑一遍完整流程
 * （渲染、开始/暂停、按键、切模式、localStorage 持久化、内联 pinyin-pro 的动态加载）。
 *
 * 运行：npm run verify:file（需要先 npm run build:offline）
 */

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { PRESS_HELPER, sleep, withBrowser } from './cdp.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = resolve(ROOT, 'dist-offline/shuangpin-offline.html')

if (!existsSync(TARGET)) {
  console.error(`❌ 找不到离线包：${TARGET}\n   先跑 npm run build:offline`)
  process.exit(1)
}

let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? `  ${detail}` : ''}`)
}

const fileUrl = pathToFileURL(TARGET).href
console.log(`目标：${fileUrl}`)

try {
  await withBrowser({ url: fileUrl, windowSize: '1280,840', extraArgs: ['--allow-file-access-from-files'] }, async (client) => {
    await sleep(1200) // 等应用挂载

    const info = await client.evaluate(`(() => ({
      protocol: location.protocol,
      appChildren: document.getElementById('app')?.children.length ?? 0,
      keys: document.querySelectorAll('.keymap .key').length,
      question: document.querySelector('.char')?.textContent ?? null,
      externalScripts: [...document.querySelectorAll('script')].filter(s => s.src).length,
      externalLinks: [...document.querySelectorAll('link')].length,
      devHook: !!window.__shuangpin,
    }))()`)

    console.log('')
    check('页面从 file:// 打开', info.protocol === 'file:', info.protocol)
    check('Vue 应用已挂载', info.appChildren > 0, `#app 子节点 ${info.appChildren}`)
    check('键位图渲染完整', info.keys === 27, `${info.keys} 个键`)
    check('题面已显示', typeof info.question === 'string' && info.question.length > 0, `题面「${info.question}」`)
    check('没有任何外部依赖', info.externalScripts === 0 && info.externalLinks === 0)
    check('生产构建（无调试钩子）', info.devHook === false)

    // 真按键：不依赖任何调试钩子，走完整 DOM 事件链路。
    // 注意要留时间给 Vue 重渲染：同步读 DOM 会读到旧值（这里也踩过一次）。

    // 1) 启动后应该停在「未开始」：题面可见、盖着开始提示、按键不进入判定
    const idle = await client.evaluate(`(async () => {
      ${PRESS_HELPER}
      const guard = document.querySelector('.guard');
      const before = document.querySelector('.stats').innerText;
      for (const code of ['KeyQ','KeyW','KeyE']) press(code);
      await sleep(250);
      return {
        guardShown: !!guard,
        guardTitle: guard?.querySelector('h3')?.textContent ?? null,
        questionVisible: !!document.querySelector('.char, .line'),
        before,
        after: document.querySelector('.stats').innerText,
      };
    })()`)
    check(
      '启动后是「未开始」状态（题面已显示）',
      idle.guardShown && idle.guardTitle === '准备开始' && idle.questionVisible,
      idle.guardTitle ?? '(没有提示层)',
    )
    check('未开始时按键不进入判定', idle.before === idle.after)

    // 2) 空格开始 -> 按键有反应
    const started = await client.evaluate(`(async () => {
      ${PRESS_HELPER}
      press('Space');
      await sleep(200);
      const guardGone = !document.querySelector('.guard');
      const before = document.querySelector('.stats').innerText;
      for (const code of ['KeyQ','KeyW','KeyE']) press(code);
      await sleep(300);
      return { guardGone, before, after: document.querySelector('.stats').innerText };
    })()`)
    check('空格可开始练习', started.guardGone === true)
    check('键盘输入有反应', started.before !== started.after)

    // 3) Esc 暂停 -> 输入被忽略 -> 空格继续
    const paused = await client.evaluate(`(async () => {
      ${PRESS_HELPER}
      press('Escape');
      await sleep(200);
      const guard = document.querySelector('.guard');
      const title = guard?.querySelector('h3')?.textContent ?? null;
      const before = document.querySelector('.stats').innerText;
      for (const code of ['KeyQ','KeyW','KeyE','Tab']) press(code);
      await sleep(300);
      const frozen = before === document.querySelector('.stats').innerText;
      const stillPaused = !!document.querySelector('.guard');
      press('Space');
      await sleep(200);
      return { guardShown: !!guard, title, frozen, stillPaused, resumed: !document.querySelector('.guard') };
    })()`)
    check('Esc 可暂停', paused.guardShown === true && paused.title === '已暂停', paused.title ?? '')
    check('暂停期间输入被忽略（含 Tab）', paused.frozen && paused.stillPaused)
    check('空格可继续', paused.resumed === true)

    // 4) 切模式：句子模式应该渲染逐字布局
    const sentence = await client.evaluate(`(async () => {
      ${PRESS_HELPER}
      const sel = [...document.querySelectorAll('.topbar select')].find(s => [...s.options].some(o => o.textContent === '句子 / 短文'));
      sel.value = 'sentence';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(400);
      return {
        lineChars: [...document.querySelectorAll('.line .ch')].map(c => c.textContent).join(''),
        hasDetail: !!document.querySelector('.detail'),
      };
    })()`)
    check('切到句子模式并渲染逐字布局', sentence.lineChars.length > 0 && sentence.hasDetail, `「${sentence.lineChars}」`)

    // 5) localStorage 持久化：改设置 -> 刷新 -> 应该还在
    const persisted = await client.evaluate(`(async () => {
      ${PRESS_HELPER}
      const cb = [...document.querySelectorAll('.topbar input[type=checkbox]')].find(c => c.closest('label')?.textContent.includes('夜间模式'));
      cb.click();
      await sleep(200);
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem('shuangpin.settings.v1')); } catch (e) { return { error: String(e) }; }
      return { nightMode: stored?.nightMode, nightApplied: document.querySelector('.app').classList.contains('night') };
    })()`)
    check(
      'file:// 下 localStorage 可写',
      !persisted.error && persisted.nightMode === true && persisted.nightApplied === true,
      persisted.error ? persisted.error : `nightMode=${persisted.nightMode}`,
    )

    await client.send('Page.reload', { ignoreCache: true })
    await sleep(1500)
    const afterReload = await client.evaluate(`(() => ({
      mounted: document.getElementById('app')?.children.length > 0,
      night: document.querySelector('.app')?.classList.contains('night') ?? false,
      mode: [...document.querySelectorAll('.topbar select')][1]?.value ?? null,
    }))()`)
    check('刷新后应用重新挂载', afterReload.mounted === true)
    check('刷新后设置仍在（持久化生效）', afterReload.night === true)
    check('刷新后模式仍在', afterReload.mode === 'sentence', `模式=${afterReload.mode}`)

    // 6) 内联后的 pinyin-pro：自定义文本模式添加一段文本
    const custom = await client.evaluate(`(async () => {
      ${PRESS_HELPER}
      const sel = [...document.querySelectorAll('.topbar select')].find(s => [...s.options].some(o => o.textContent === '自定义文本'));
      sel.value = 'custom';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(350);
      [...document.querySelectorAll('.topbar button')].find(b => b.textContent.includes('编辑文本')).click();
      await sleep(120);
      const ta = document.querySelector('.overlay textarea');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, '今天天气很好，我们出去走走。');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(80);
      [...document.querySelectorAll('.overlay .btn')].find(b => b.textContent.includes('添加')).click();
      for (let i = 0; i < 60 && !document.querySelector('.overlay .msg'); i += 1) await sleep(120);
      return { msg: document.querySelector('.overlay .msg')?.textContent?.trim() ?? null };
    })()`)
    check(
      '内联的 pinyin-pro 动态加载可用',
      typeof custom.msg === 'string' && custom.msg.includes('已添加'),
      custom.msg ?? '(没有返回)',
    )

    // 清掉验证过程写进去的数据，避免影响用户第一次打开
    await client.evaluate(`(() => { try { localStorage.clear(); } catch (e) {} return true; })()`)
  })
} catch (error) {
  failed = true
  console.error(`❌ 验证过程中出错：${error instanceof Error ? error.message : String(error)}`)
}

console.log('')
if (failed) {
  console.error('结论：file:// 验证未通过')
  process.exit(1)
}
console.log('结论：离线单文件包在 file:// 下完整可用（双击即可，不需要服务器/联网）')
