/**
 * 出题权重工具。
 *
 * 语料表都是按频率排好序的，但我们没有把频率值本身存进数据文件（省体积），
 * 所以用名次近似频率：按 Zipf 分布，频率 ≈ 1/名次。
 * 直接归一化会让榜首那个词独占大半概率，所以做一次幂压缩（默认 0.35），
 * 让前几百名的出现概率有明显差别、但不至于垄断题库。
 */

const EXPONENT = 0.35
const MAX_WEIGHT = 100

/** 名次（从 1 开始）-> 整数权重 1~100 */
export function rankWeight(rank: number): number {
  if (rank <= 1) return MAX_WEIGHT
  const weight = Math.round(MAX_WEIGHT / Math.pow(rank, EXPONENT))
  return Math.max(1, weight)
}

/** 为按频率排序的列表预生成权重池（避免每次抽题都算） */
export function buildRankPool(length: number): number[] {
  // pool[i] = 该名次在池子里占几个槽位
  const pool: number[] = new Array(length)
  for (let i = 0; i < length; i += 1) pool[i] = rankWeight(i + 1)
  return pool
}

/** 按权重池随机取一个下标 */
export function pickIndexByWeight(weights: readonly number[]): number {
  let total = 0
  for (const w of weights) total += w
  let ticket = Math.random() * total
  for (let i = 0; i < weights.length; i += 1) {
    ticket -= weights[i]
    if (ticket <= 0) return i
  }
  return weights.length - 1
}

/**
 * 近期去重：避免连续抽到同一个词/字。
 * 全被过滤掉时退回全集，保证一定能出题。
 */
export function createRecentFilter(limit: number) {
  const recent: string[] = []
  return {
    has(key: string): boolean {
      return recent.includes(key)
    },
    push(key: string): void {
      recent.push(key)
      if (recent.length > limit) recent.shift()
    },
    clear(): void {
      recent.length = 0
    },
  }
}
