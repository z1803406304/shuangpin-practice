/** 键码 <-> 字母的小工具（给历史记录 / 结算面板展示用） */

/** KeyboardEvent.code -> 键帽字母，例如 KeyQ -> q、Semicolon -> ; */
export function codeToLetter(code: string): string {
  if (code === 'Semicolon') return ';'
  if (code.startsWith('Key')) return code.slice(3).toLowerCase()
  return code
}

/** 把键码序列渲染成 'q w' 这样的字符串 */
export function codesToLetters(codes: readonly string[]): string {
  return codes.map(codeToLetter).join(' ')
}
