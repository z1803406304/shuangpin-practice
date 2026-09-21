/**
 * 极简音效：用 WebAudio 现场合成，不依赖任何音频文件。
 *
 * 设计上刻意做得短而轻（正弦波 40~120ms），因为打字练习里音效每秒都在响，
 * 稍微长一点就会变成噪音。默认关闭，在「更多设置」里开。
 */

let audio: AudioContext | null = null

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (audio) return audio
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    audio = new Ctor()
  } catch {
    audio = null
  }
  return audio
}

function tone(frequency: number, durationMs: number, type: OscillatorType, gainValue: number): void {
  const ctx = context()
  if (!ctx) return
  // 浏览器要求用户交互后才能播放，这里顺手恢复一下挂起的上下文
  if (ctx.state === 'suspended') void ctx.resume()
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  const now = ctx.currentTime
  const duration = durationMs / 1000
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, now)
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(gainValue, now + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(now)
  oscillator.stop(now + duration + 0.01)
}

export const sound = {
  /** 按对一个键 */
  hit(): void {
    tone(880, 45, 'sine', 0.035)
  },
  /** 按错 */
  miss(): void {
    tone(180, 120, 'triangle', 0.06)
  },
  /** 完成一道题 */
  complete(): void {
    tone(1180, 60, 'sine', 0.045)
  },
  /** 结算时的收尾音 */
  finish(): void {
    tone(660, 90, 'sine', 0.045)
  },
}
