/** Year-month key like "2026-11" */
export type YearMonth = string

export interface PayrollPosition {
  id: string
  name: string
  monthlyAmount: number
}

export interface ExpenseBucket {
  id: string
  name: string
  /** Default monthly amount from effectiveMonth onward (unless overridden) */
  monthlyAmount: number
  /** First month this amount applies (YYYY-MM) */
  effectiveMonth: YearMonth
  /** Per-month overrides keyed by YYYY-MM */
  overrides: Record<YearMonth, number>
}

export interface RevenueRow {
  id: string
  name: string
  /** Per-month cash received, keyed by YYYY-MM */
  amounts: Record<YearMonth, number>
  /** When true, counted as funding (not operating receipts) */
  isFunding: boolean
}

/** One-time cash expense applied in a single payment month only (not recurring). */
export interface OneTimeExpense {
  id: string
  name: string
  amount: number
  /** Effective / payment month (YYYY-MM) — cash hit in this month only */
  month: YearMonth
}

/** Allowed planning horizons (months). Reused as `forecastMonths`. */
export const PLANNING_HORIZONS = [3, 6, 7, 9, 10, 11, 12] as const
export type PlanningHorizon = (typeof PLANNING_HORIZONS)[number]

export interface AppState {
  startMonth: YearMonth
  availableCash: number
  expectedAR: number
  arCollectionMonth: YearMonth
  payroll: PayrollPosition[]
  expenseBuckets: ExpenseBucket[]
  /** One-time Prospect expenses (e.g. Data contract); counted only in `month`. */
  oneTimeExpenses: OneTimeExpense[]
  revenueRows: RevenueRow[]
  /** Planning / forecast horizon in months (3 | 6 | 7 | 9 | 10 | 11 | 12). Default 12. */
  forecastMonths: PlanningHorizon
}

/** Named what-if snapshot; each holds a full AppState. */
export interface Scenario {
  id: string
  name: string
  state: AppState
}

export interface ScenarioStore {
  activeScenarioId: string
  scenarios: Scenario[]
}

/** Max monthly operating net burn to stretch available cash across the horizon. */
export interface BurnBudget {
  horizonMonths: PlanningHorizon
  /** availableCash / horizon — conservative ceiling (cash only) */
  cashCeiling: number
  /** (availableCash + AR) / horizon when AR lands inside horizon; else same as cashCeiling */
  softCeiling: number
  /** Whether expected AR is timed inside the selected horizon */
  arInHorizon: boolean
  /** Month-1 operating net burn (expenses − op receipts − AR) */
  currentBurn: number
  /** cashCeiling − currentBurn; positive = under budget */
  remainingBudget: number
  /** currentBurn <= cashCeiling */
  onTrack: boolean
}

export interface MonthProjection {
  month: YearMonth
  beginningCash: number
  operatingReceipts: number
  arCollections: number
  funding: number
  expenses: number
  endingCash: number
  /** Operating net burn this month (expenses − operating receipts − AR); positive = burning */
  operatingNetBurn: number
}

export type RunwayKind = 'no-burn' | 'months' | 'horizon-plus'

export interface RunwayResult {
  kind: RunwayKind
  /** Human label e.g. "No cash burn", "4.2 months", "12+ months" */
  label: string
  /** Estimated exhaustion month (YYYY-MM), or null if none within forecast */
  exhaustionMonth: YearMonth | null
  /** Fractional months of runway from start, or Infinity for no-burn / horizon+ */
  months: number
}

export interface ForecastResult {
  months: MonthProjection[]
  totalMonthlyExpenses: number
  /** First month operating net burn (expenses − op receipts − AR), positive = burn */
  operatingNetBurn: number
  runway: RunwayResult
}
