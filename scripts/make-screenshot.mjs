/**
 * 生成 README 用的截图。
 *
 * 用法：
 *   1. 先起开发服务器：npm run dev
 *   2. node scripts/make-screenshot.mjs
 *   → docs/screenshot-practice.png（练习界面）
 *     docs/screenshot-history.png（历史记录 + 累计错误热力图）
 *
 * 为什么用开发服务器：脚本需要 `window.__shuangpin` 调试钩子来**构造真实的练习数据**
 * （先练几轮、故意按错几次），否则截图里的统计全是 0、历史面板是空的，很难看。
 * 钩子只在开发构建里存在，所以不能对生产构建跑这个脚本。
 */

import { resolve } from 'node:path'

import { PRESS_HELPER, sleep, withBrowser } from './cdp.mjs'

const URL = process.env.SCREENSHOT_URL ?? 'http://localhost:5273/'
const DOCS = resolve(import.meta.dirname, '../docs')

async function main() {
  // 先确认开发服务器在跑
  try {
    const res = await fetch(URL)
    if (!res.ok) throw new Error(String(res.status))
  } catch (error) {
    console.error(`❌ ${URL} 打不开（${error.message}）`)
    console.error('   先在一个终端里跑 npm run dev，再执行这个脚本。')
    process.exit(1)
  }

  await withBrowser({ url: URL, windowSize: '1320,940' }, async (client) => {
    await sleep(1500)

    const hasHook = await client.evaluate('!!window.__shuangpin')
    if (!hasHook) {
      throw new Error('页面上没有调试钩子 —— 这个脚本需要开发构建（npm run dev）')
    }

    // ── 构造数据：练 3 轮，其中掺入按错，让统计与热力图有内容 ──
    const seeded = await client.evaluate(`(async () => {
      ${PRESS_HELPER}
      const hook = window.__shuangpin;
      const sp = hook.session;
      const st = hook.settings;
      const finish = async () => {
        for (let i = 0; i < 40 && !sp.state.solved; i += 1) {
          const next = sp.nextCode.value;
          if (!next) break;
          press(next);
          await tick();
        }
        await sleep(200);
      };

      const plan = [
        { mode: 'syllable', rounds: 9, miss: ['KeyQ', 'KeyZ'] },
        { mode: 'hanzi', rounds: 8, miss: ['KeyQ', 'KeyM'] },
        { mode: 'hanzi', rounds: 7, miss: ['KeyE'] },
      ];
      for (const step of plan) {
        st.modeId = step.mode;
        await sleep(320);
        press('Space');
        await tick();
        for (let i = 0; i < step.rounds; i += 1) {
          // 每 3 题故意按错一次（严格模式下本题会重来，最终仍答对）
          if (i % 3 === 1) {
            press(step.miss[i % step.miss.length]);
            await tick();
          }
          await finish();
        }
        sp.finishRound(false);   // 静默结算，不弹面板
        await sleep(220);
      }
      // 当前这一轮再练几题，让统计条有数字
      st.modeId = 'syllable';
      await sleep(320);
      press('Space');
      await tick();
      for (let i = 0; i < 6; i += 1) {
        if (i === 2) { press('KeyQ'); await tick(); }
        await finish();
      }
      // 让当前题停在"打了一半"的状态，看起来更像在用
      press('Space');
      await tick();
      const first = sp.nextCode.value;
      if (first) press(first);
      await tick();
      return {
        done: sp.liveStats.value.done,
        cpm: Math.round(sp.liveStats.value.cpm),
        history: JSON.parse(localStorage.getItem('shuangpin.history.v1') ?? '{"records":[]}').records.length,
      };
    })()`)
    console.log(`   构造数据：本轮 ${seeded.done} 题 · ${seeded.cpm} 字/分 · 历史 ${seeded.history} 轮`)

    // ── 截图 1：练习界面 ──
    await client.screenshot(resolve(DOCS, 'screenshot-practice.png'))
    console.log('✅ docs/screenshot-practice.png')

    // ── 截图 2：历史记录 + 累计热力图 ──
    await client.evaluate(`(async () => {
      ${PRESS_HELPER}
      document.querySelector('.actions .btn.primary')?.click();  // 结算，让本轮也进历史
      await sleep(250);
      press('Escape');
      await sleep(150);
      [...document.querySelectorAll('.actions .btn')].find((b) => b.textContent.includes('历史记录'))?.click();
      await sleep(400);
      // 表格滚动到顶部，保证热力图和曲线都在视野里
      document.querySelector('.overlay .card')?.scrollTo(0, 0);
      return true;
    })()`)
    await sleep(300)
    await client.screenshot(resolve(DOCS, 'screenshot-history.png'))
    console.log('✅ docs/screenshot-history.png')
  })
}

await main()
