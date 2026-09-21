/**
 * 应用版本号。
 *
 * 只在 `package.json` 里维护一份，由 vite.config.ts 通过 define 注入成 `__APP_VERSION__`。
 * 这样界面上的版本号不会和实际发布版本脱节（之前这里硬编码着 v0.2.0，
 * 而 package.json 已经走到 1.0.0 了 —— 两处各写一遍必然会不一致）。
 */

declare const __APP_VERSION__: string

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
