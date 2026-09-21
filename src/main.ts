import { createApp } from 'vue'
import App from './App.vue'
import * as customTexts from './stores/customTexts.ts'
import { session } from './stores/session.ts'
import { settings } from './stores/settings.ts'
import * as ui from './stores/ui.ts'
import './styles/theme.css'

createApp(App).mount('#app')

if (import.meta.env.DEV) {
  // 仅开发期存在的调试钩子：方便在浏览器里做端到端自动验证。
  // 生产构建（npm run build）里 import.meta.env.DEV 为 false，这段会被摇掉。
  Object.assign(window, { __shuangpin: { session, settings, customTexts, ui } })
}
