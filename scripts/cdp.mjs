/**
 * 极简 CDP（Chrome DevTools Protocol）客户端 + 无头浏览器启动器。
 *
 * 用来干两件内置浏览器工具做不到的事：
 * 1. 打开真正的 file:// 页面（内置工具只允许 http(s)）——见 verify-file-url.mjs
 * 2. 把页面截成图片文件——见 make-screenshot.mjs
 *
 * 只用 Node 内置的 WebSocket（Node 22+ 自带），不需要 puppeteer。
 */

import { spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA ?? ''}/Google/Chrome/Application/chrome.exe`,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function findBrowser() {
  for (const path of BROWSERS) {
    if (path && existsSync(path)) return path
  }
  return null
}

async function waitForTarget(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page' && typeof t.webSocketDebuggerUrl === 'string')
      if (page) return page
    } catch {
      /* 浏览器还没起来 */
    }
    await sleep(250)
  }
  throw new Error('等待 DevTools 端口超时')
}

function createClient(wsUrl) {
  const ws = new WebSocket(wsUrl)
  const pending = new Map()
  let nextId = 1
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve())
    ws.addEventListener('error', (e) => reject(new Error(`WebSocket 错误：${e.message ?? e.type}`)))
  })
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    const entry = pending.get(msg.id)
    if (!entry) return
    pending.delete(msg.id)
    if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)))
    else entry.resolve(msg.result)
  })

  return {
    ready,
    send(method, params = {}) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      })
    },
    /** 在页面里跑一段表达式并取值（支持 await） */
    async evaluate(expression) {
      const result = await this.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true,
      })
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description ?? '页面里抛异常')
      }
      return result.result.value
    },
    /** 截屏并写入文件 */
    async screenshot(path, { fullPage = false } = {}) {
      const { data } = await this.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: fullPage,
      })
      const { writeFileSync, mkdirSync } = await import('node:fs')
      const { dirname } = await import('node:path')
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, Buffer.from(data, 'base64'))
      return path
    },
    close() {
      ws.close()
    },
  }
}

/**
 * 启动无头浏览器、连上 CDP、把 client 交给 fn，结束后一定清理干净。
 *
 * 临时 profile 放在**系统临时目录**：放在项目里会生成几万个文件，
 * 把 Vite 的 watcher 直接搞崩（踩过一次）。
 */
export async function withBrowser(options, fn) {
  const { url, port = 9333 + Math.floor(Math.random() * 200), windowSize = '1280,820', extraArgs = [] } = options
  const browserPath = findBrowser()
  if (!browserPath) throw new Error('找不到 Chrome / Edge，无法执行')

  const profile = join(tmpdir(), `dsh-cdp-${process.pid}-${port}`)
  const child = spawn(
    browserPath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--hide-scrollbars',
      `--window-size=${windowSize}`,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      ...extraArgs,
      url,
    ],
    { stdio: 'ignore' },
  )

  let client = null
  try {
    const target = await waitForTarget(port)
    client = createClient(target.webSocketDebuggerUrl)
    await client.ready
    await client.send('Runtime.enable')
    await client.send('Page.enable')
    return await fn(client)
  } finally {
    try {
      client?.close()
    } catch {
      /* 忽略 */
    }
    child.kill()
    for (let i = 0; i < 20; i += 1) {
      await sleep(250)
      try {
        rmSync(profile, { recursive: true, force: true })
        break
      } catch {
        /* 文件还被占用，再等等 */
      }
    }
  }
}

/** 注入到页面里的按键派发函数（跨脚本共用） */
export const PRESS_HELPER = `
  const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
  const tick = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
`
