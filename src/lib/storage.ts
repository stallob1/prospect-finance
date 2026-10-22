import { normalizeHorizon } from './calc'
import {
  cloneAppState,
  createDefaultScenarioStore,
  createDefaultState,
  createScenario,
} from './defaults'
import type { AppState, Scenario, ScenarioStore } from './types'

export const STORAGE_KEY = 'prospect-finance-runway-v1'
/** Scenarios + active id (v2). Migrates from flat AppState under STORAGE_KEY. */
export const SCENARIO_STORAGE_KEY = 'prospect-finance-scenarios-v1'

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

/** Best-effort hydrate a single AppState; falls back to defaults on missing/corrupt data. */
export function hydrateAppState(parsed: unknown): AppState {
  const defaults = createDefaultState()
  if (!isRecord(parsed)) return defaults

  return {
    startMonth: asString(parsed.startMonth, defaults.startMonth),
    availableCash: asNumber(parsed.availableCash, defaults.availableCash),
    expectedAR: asNumber(parsed.expectedAR, defaults.expectedAR),
    arCollectionMonth: asString(
      parsed.arCollectionMonth,
      defaults.arCollectionMonth,
    ),
    forecastMonths: normalizeHorizon(
      parsed.forecastMonths ?? defaults.forecastMonths,
    ),
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
    oneTimeExpenses: (() => {
      const start = asString(parsed.startMonth, defaults.startMonth)
      const seed = defaults.oneTimeExpenses
      if (!Array.isArray(parsed.oneTimeExpenses)) return seed
      const rows = parsed.oneTimeExpenses.map((e, i) => {
        const row = isRecord(e) ? e : {}
        const d = seed[i]
        return {
          id: asString(row.id, d?.id ?? `ot-${i}`),
          name: asString(row.name, d?.name ?? `One-time ${i + 1}`),
          amount: asNumber(row.amount, 0),
          month: asString(row.month, d?.month ?? start),
        }
      })
      // Ensure seeded "Data contract" exists for older saves
      if (!rows.some((r) => r.name === 'Data contract')) {
        const dc = seed.find((r) => r.name === 'Data contract') ?? seed[0]
        if (dc) {
          rows.unshift({
            ...dc,
            amount: 0,
            month: start,
          })
        }
      }
      return rows
    })(),
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
}

/** @deprecated Prefer loadScenarioStore; kept for verify / migration. */
export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultState()
    return hydrateAppState(JSON.parse(raw))
  } catch {
    return createDefaultState()
  }
}

/** @deprecated Prefer saveScenarioStore */
export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore quota / private-mode failures
  }
}

function hydrateScenario(raw: unknown, index: number): Scenario | null {
  if (!isRecord(raw)) return null
  const name = asString(raw.name, `Scenario ${index + 1}`)
  const id = asString(raw.id, `scen-${index}`)
  const state = hydrateAppState(raw.state)
  return { id, name, state }
}

/**
 * Load scenario store. Migrates legacy flat AppState under STORAGE_KEY into
 * a single "Working" scenario when scenarios key is missing.
 */
export function loadScenarioStore(): ScenarioStore {
  const fallback = createDefaultScenarioStore()
  try {
    const raw = localStorage.getItem(SCENARIO_STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (!isRecord(parsed) || !Array.isArray(parsed.scenarios)) {
        return fallback
      }
      const scenarios = parsed.scenarios
        .map((s, i) => hydrateScenario(s, i))
        .filter((s): s is Scenario => s !== null)
      if (scenarios.length === 0) return fallback

      let activeScenarioId = asString(
        parsed.activeScenarioId,
        scenarios[0].id,
      )
      if (!scenarios.some((s) => s.id === activeScenarioId)) {
        activeScenarioId = scenarios[0].id
      }
      return { activeScenarioId, scenarios }
    }

    // Migrate v1 flat state → Working scenario
    const legacyRaw = localStorage.getItem(STORAGE_KEY)
    if (legacyRaw) {
      const state = hydrateAppState(JSON.parse(legacyRaw))
      const working = createScenario('Working', state)
      return { activeScenarioId: working.id, scenarios: [working] }
    }

    return fallback
  } catch {
    return fallback
  }
}

export function saveScenarioStore(store: ScenarioStore): void {
  try {
    localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(store))
    // Keep v1 key in sync with active scenario for older readers / debugging
    const active = store.scenarios.find((s) => s.id === store.activeScenarioId)
    if (active) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(active.state))
    }
  } catch {
    // Ignore quota / private-mode failures
  }
}

export function getActiveState(store: ScenarioStore): AppState {
  const active = store.scenarios.find((s) => s.id === store.activeScenarioId)
  return active ? active.state : store.scenarios[0]?.state ?? createDefaultState()
}

/** Update active scenario's state (auto-save path). */
export function withActiveState(
  store: ScenarioStore,
  state: AppState,
): ScenarioStore {
  return {
    ...store,
    scenarios: store.scenarios.map((s) =>
      s.id === store.activeScenarioId
        ? { ...s, state: cloneAppState(state) }
        : s,
    ),
  }
}
