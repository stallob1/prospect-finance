import type {
  AppState,
  BurnBudget,
  ExpenseBucket,
  ForecastResult,
  MonthProjection,
  PlanningHorizon,
  RunwayResult,
  YearMonth,
} from './types'
import { PLANNING_HORIZONS } from './types'

export { PLANNING_HORIZONS }
export type { PlanningHorizon }

/** Clamp / normalize to an allowed planning horizon (default 12). */
export function normalizeHorizon(n: unknown): PlanningHorizon {
  const v = typeof n === 'number' ? n : Number(n)
  if ((PLANNING_HORIZONS as readonly number[]).includes(v)) {
    return v as PlanningHorizon
  }
  return 12
}

/** Parse YYYY-MM into year + zero-based month index helpers. */
function parseYearMonth(ym: YearMonth): { y: number; m: number } {
  const [ys, ms] = ym.split('-')
  const y = Number(ys)
  const m = Number(ms)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error(`Invalid YearMonth: ${ym}`)
  }
  return { y, m }
}

export function addMonths(ym: YearMonth, delta: number): YearMonth {
  const { y, m } = parseYearMonth(ym)
  const idx = y * 12 + (m - 1) + delta
  const ny = Math.floor(idx / 12)
  const nm = (idx % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

export function monthKeys(start: YearMonth, n: number): YearMonth[] {
  const keys: YearMonth[] = []
  for (let i = 0; i < n; i++) keys.push(addMonths(start, i))
  return keys
}

export function formatMonthLabel(ym: YearMonth): string {
  const { y, m } = parseYearMonth(ym)
  const d = new Date(Date.UTC(y, m - 1, 1))
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** Compare YYYY-MM lexicographically (safe because zero-padded). */
function cmpYm(a: YearMonth, b: YearMonth): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function expenseForBucket(bucket: ExpenseBucket, month: YearMonth): number {
  if (Object.prototype.hasOwnProperty.call(bucket.overrides, month)) {
    return Number(bucket.overrides[month]) || 0
  }
  if (cmpYm(month, bucket.effectiveMonth) < 0) return 0
  return Number(bucket.monthlyAmount) || 0
}

export function totalPayroll(state: AppState): number {
  return state.payroll.reduce((sum, p) => sum + (Number(p.monthlyAmount) || 0), 0)
}

/** Sum of one-time expenses whose payment month matches `month`. */
export function oneTimeExpensesForMonth(
  state: AppState,
  month: YearMonth,
): number {
  const rows = state.oneTimeExpenses ?? []
  return rows.reduce((sum, e) => {
    if (e.month !== month) return sum
    return sum + (Number(e.amount) || 0)
  }, 0)
}

export function totalExpenses(state: AppState, month: YearMonth): number {
  const payroll = totalPayroll(state)
  const buckets = state.expenseBuckets.reduce(
    (sum, b) => sum + expenseForBucket(b, month),
    0,
  )
  const oneTime = oneTimeExpensesForMonth(state, month)
  return payroll + buckets + oneTime
}

export function operatingReceipts(state: AppState, month: YearMonth): number {
  return state.revenueRows
    .filter((r) => !r.isFunding)
    .reduce((sum, r) => sum + (Number(r.amounts[month]) || 0), 0)
}

export function fundingReceipts(state: AppState, month: YearMonth): number {
  return state.revenueRows
    .filter((r) => r.isFunding)
    .reduce((sum, r) => sum + (Number(r.amounts[month]) || 0), 0)
}

/** AR collected once in arCollectionMonth only — never folded into starting cash. */
export function arCollections(state: AppState, month: YearMonth): number {
  if (month === state.arCollectionMonth) return Number(state.expectedAR) || 0
  return 0
}

function computeRunway(months: MonthProjection[]): RunwayResult {
  const allZeroExpenses = months.every((m) => m.expenses === 0)
  const anyShortfall = months.some((m) => m.endingCash < 0)

  if (allZeroExpenses && !anyShortfall) {
    return {
      kind: 'no-burn',
      label: 'No cash burn',
      exhaustionMonth: null,
      months: Infinity,
    }
  }

  if (!anyShortfall) {
    const horizon = months.length
    return {
      kind: 'horizon-plus',
      label: `${horizon}+ months`,
      exhaustionMonth: null,
      months: Infinity,
    }
  }

  const shortfallIdx = months.findIndex((m) => m.endingCash < 0)
  const short = months[shortfallIdx]
  const beginning = short.beginningCash
  const burn = short.operatingNetBurn

  let fractional = shortfallIdx
  if (burn > 0 && beginning > 0) {
    fractional = shortfallIdx + beginning / burn
  } else if (burn > 0 && beginning <= 0) {
    fractional = shortfallIdx
  } else {
    // Burn not positive: treat as exhausted at start of that month
    fractional = shortfallIdx
  }

  const rounded = Math.round(fractional * 10) / 10
  return {
    kind: 'months',
    label: `${rounded.toFixed(1)} months`,
    exhaustionMonth: short.month,
    months: rounded,
  }
}

export function projectForecast(state: AppState): ForecastResult {
  const horizon = normalizeHorizon(state.forecastMonths)
  const keys = monthKeys(state.startMonth, horizon)
  const projections: MonthProjection[] = []
  let beginning = Number(state.availableCash) || 0

  for (const month of keys) {
    const op = operatingReceipts(state, month)
    const ar = arCollections(state, month)
    const fund = fundingReceipts(state, month)
    const expenses = totalExpenses(state, month)
    const ending = beginning + op + ar + fund - expenses
    const operatingNetBurn = expenses - op - ar

    projections.push({
      month,
      beginningCash: beginning,
      operatingReceipts: op,
      arCollections: ar,
      funding: fund,
      expenses,
      endingCash: ending,
      operatingNetBurn,
    })

    beginning = ending
  }

  const first = projections[0]
  const totalMonthlyExpenses = first ? first.expenses : 0
  const operatingNetBurn = first ? first.operatingNetBurn : 0

  return {
    months: projections,
    totalMonthlyExpenses,
    operatingNetBurn,
    runway: computeRunway(projections),
  }
}

/**
 * Approximate max monthly operating net burn to last `horizon` months from
 * starting cash. AR is not folded into cash — when it lands inside the
 * horizon it lifts a soft upper band only (no double-count).
 *
 * Current burn = month-1 operating net burn (same as forecast summary).
 */
export function computeBurnBudget(
  state: AppState,
  currentBurn?: number,
): BurnBudget {
  const horizonMonths = normalizeHorizon(state.forecastMonths)
  const cash = Number(state.availableCash) || 0
  const ar = Number(state.expectedAR) || 0
  const keys = monthKeys(state.startMonth, horizonMonths)
  const arInHorizon =
    ar > 0 && keys.includes(state.arCollectionMonth)

  const cashCeiling = horizonMonths > 0 ? cash / horizonMonths : 0
  const softCeiling = arInHorizon
    ? (cash + ar) / horizonMonths
    : cashCeiling

  const burn =
    currentBurn !== undefined
      ? currentBurn
      : projectForecast(state).operatingNetBurn

  const remainingBudget = cashCeiling - burn

  return {
    horizonMonths,
    cashCeiling,
    softCeiling,
    arInHorizon,
    currentBurn: burn,
    remainingBudget,
    onTrack: burn <= cashCeiling,
  }
}
