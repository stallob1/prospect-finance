import type { AppState } from './types'
import { createDefaultState } from './defaults'

export const STORAGE_KEY = 'prospect-finance-runway-v1'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asNumber(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback
}

/** Best-effort hydrate; falls back to defaults on missing/corrupt data. */
export function loadState(): AppState {
  const defaults = createDefaultState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return defaults

    return {
      startMonth: asString(parsed.startMonth, defaults.startMonth),
      availableCash: asNumber(parsed.availableCash, defaults.availableCash),
      expectedAR: asNumber(parsed.expectedAR, defaults.expectedAR),
      arCollectionMonth: asString(
        parsed.arCollectionMonth,
        defaults.arCollectionMonth,
      ),
      forecastMonths: asNumber(parsed.forecastMonths, defaults.forecastMonths),
      payroll: Array.isArray(parsed.payroll)
        ? parsed.payroll.map((p, i) => {
            const row = isRecord(p) ? p : {}
            const d = defaults.payroll[i]
            return {
              id: asString(row.id, d?.id ?? `pay-${i}`),
              name: asString(row.name, d?.name ?? `Person ${i + 1}`),
              monthlyAmount: asNumber(row.monthlyAmount, 0),
            }
          })
        : defaults.payroll,
      expenseBuckets: Array.isArray(parsed.expenseBuckets)
        ? parsed.expenseBuckets.map((b, i) => {
            const row = isRecord(b) ? b : {}
            const d = defaults.expenseBuckets[i]
            const overridesRaw = isRecord(row.overrides) ? row.overrides : {}
            const overrides: Record<string, number> = {}
            for (const [k, v] of Object.entries(overridesRaw)) {
              overrides[k] = asNumber(v, 0)
            }
            return {
              id: asString(row.id, d?.id ?? `exp-${i}`),
              name: asString(row.name, d?.name ?? `Expense ${i + 1}`),
              monthlyAmount: asNumber(row.monthlyAmount, 0),
              effectiveMonth: asString(
                row.effectiveMonth,
                d?.effectiveMonth ?? defaults.startMonth,
              ),
              overrides,
            }
          })
        : defaults.expenseBuckets,
      revenueRows: Array.isArray(parsed.revenueRows)
        ? parsed.revenueRows.map((r, i) => {
            const row = isRecord(r) ? r : {}
            const d = defaults.revenueRows[i]
            const amountsRaw = isRecord(row.amounts) ? row.amounts : {}
            const amounts: Record<string, number> = {}
            for (const [k, v] of Object.entries(amountsRaw)) {
              amounts[k] = asNumber(v, 0)
            }
            return {
              id: asString(row.id, d?.id ?? `rev-${i}`),
              name: asString(row.name, d?.name ?? `Revenue ${i + 1}`),
              amounts,
              isFunding: Boolean(row.isFunding ?? d?.isFunding ?? false),
            }
          })
        : defaults.revenueRows,
    }
  } catch {
    return defaults
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore quota / private-mode failures
  }
}
