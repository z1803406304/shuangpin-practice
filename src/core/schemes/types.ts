/**
 * 双拼方案的类型定义。
 *
 * 这里是「方案」与「渲染/判定」之间的契约：键位图、输入判定、提示、
 * 统计热力图全部只依赖这些类型，因此新增方案（自然码 / 微软双拼 …）
 * 只需要实现一个 Scheme 对象，UI 一行都不用改。
 */

/** 一个物理按键的定义 */
export interface KeyDef {
  /** KeyboardEvent.code，例如 KeyQ / Semicolon */
  code: string
  /** 键帽上显示的字母 */
  letter: string
  /** 该键承载的声母（如 V 键承载 zh） */
  initials: readonly string[]
  /** 该键承载的韵母（含全拼写法别名，如 ve 即 üe） */
  finals: readonly string[]
}

/** 零声母音节（a / ai / ang …）的整音节编码 */
export interface ZeroInitialEntry {
  /** 音节本身 */
  syllable: string
  /** 两字母编码，例如 ang -> 'ah' */
  code: string
}

/** 一个音节编码后的结果 */
export interface Encoded {
  /** 规范化后的无调音节（ü 写作 v）；键位训练模式下是题面标签 */
  syllable: string
  /** 声母，零声母时为空串 */
  initial: string
  /** 韵母，零声母时为空串 */
  final: string
  /**
   * 需要按的键码，例如 ['KeyG', 'KeyR']。
   * 长度不固定：普通音节是 2 个键，键位记忆训练的题目只按 1 个键。
   */
  codes: readonly string[]
  /** 对应键帽字母，与 codes 一一对应，例如 ['g', 'r'] */
  letters: readonly string[]
  /** 是否是零声母音节 */
  zeroInitial: boolean
}

/** 一套双拼方案 */
export interface Scheme {
  id: string
  name: string
  /** 顶栏「模式说明」里展示的一句话描述 */
  description: string
  /** 键位图的三行按键 */
  keyRows: readonly (readonly KeyDef[])[]
  /** 零声母表（按展示顺序） */
  zeroInitial: readonly ZeroInitialEntry[]
  /** 音节 -> 双拼编码；无法编码（如 n / ng / ê）时返回 null */
  encode(syllable: string): Encoded | null
}
