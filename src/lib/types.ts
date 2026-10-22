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

export interface AppState {
  startMonth: YearMonth
  availableCash: number
  expectedAR: number
  arCollectionMonth: YearMonth
  payroll: PayrollPosition[]
  expenseBuckets: ExpenseBucket[]
  revenueRows: RevenueRow[]
  forecastMonths: number
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

export type RunwayKind = 'no-burn' | 'months' | 'twelve-plus'

export interface RunwayResult {
  kind: RunwayKind
  /** Human label e.g. "No cash burn", "4.2 months", "12+ months" */
  label: string
  /** Estimated exhaustion month (YYYY-MM), or null if none within forecast */
  exhaustionMonth: YearMonth | null
  /** Fractional months of runway from start, or Infinity for no-burn / 12+ */
  months: number
}

export interface ForecastResult {
  months: MonthProjection[]
  totalMonthlyExpenses: number
  /** First month operating net burn (expenses − op receipts − AR), positive = burn */
  operatingNetBurn: number
  runway: RunwayResult
}
