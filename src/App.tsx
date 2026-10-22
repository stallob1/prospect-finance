import { useEffect, useId, useMemo, useState } from 'react'
import {
  addMonths,
  formatMonthLabel,
  monthKeys,
  projectForecast,
} from './lib/calc'
import { createDefaultState } from './lib/defaults'
import { loadState, saveState } from './lib/storage'
import type {
  AppState,
  ExpenseBucket,
  PayrollPosition,
  RevenueRow,
  YearMonth,
} from './lib/types'
import './App.css'

function money(n: number): string {
  const abs = Math.abs(n)
  const formatted = abs.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
  return n < 0 ? `−${formatted}` : formatted
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function CashChart({
  months,
}: {
  months: { month: YearMonth; endingCash: number }[]
}) {
  const width = 720
  const height = 220
  const pad = { top: 16, right: 16, bottom: 36, left: 64 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom

  const values = months.map((m) => m.endingCash)
  const minV = Math.min(0, ...values)
  const maxV = Math.max(0, ...values)
  const span = maxV - minV || 1

  const xAt = (i: number) =>
    pad.left + (months.length <= 1 ? innerW / 2 : (i / (months.length - 1)) * innerW)
  const yAt = (v: number) => pad.top + ((maxV - v) / span) * innerH

  const points = months
    .map((m, i) => `${xAt(i)},${yAt(m.endingCash)}`)
    .join(' ')

  const zeroY = yAt(0)
  const areaPath =
    months.length > 0
      ? `M ${xAt(0)} ${zeroY} L ${points
          .split(' ')
          .map((p) => p)
          .join(' L ')} L ${xAt(months.length - 1)} ${zeroY} Z`
      : ''

  return (
    <svg
      className="cash-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Ending cash by month"
    >
      <defs>
        <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line
        x1={pad.left}
        x2={width - pad.right}
        y1={zeroY}
        y2={zeroY}
        className="chart-zero"
      />
      {areaPath && <path d={areaPath} fill="url(#cashFill)" />}
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {months.map((m, i) => (
        <g key={m.month}>
          <circle cx={xAt(i)} cy={yAt(m.endingCash)} r="3.5" fill="var(--accent)" />
          {(i === 0 || i === months.length - 1 || i % 2 === 0) && (
            <text
              x={xAt(i)}
              y={height - 10}
              textAnchor="middle"
              className="chart-label"
            >
              {formatMonthLabel(m.month).replace(' ', '\u00a0')}
            </text>
          )}
        </g>
      ))}
      <text x={pad.left - 8} y={yAt(maxV) + 4} textAnchor="end" className="chart-label">
        {money(maxV)}
      </text>
      <text x={pad.left - 8} y={zeroY + 4} textAnchor="end" className="chart-label">
        $0
      </text>
      {minV < 0 && (
        <text x={pad.left - 8} y={yAt(minV) + 4} textAnchor="end" className="chart-label">
          {money(minV)}
        </text>
      )}
    </svg>
  )
}

export default function App() {
  const [state, setState] = useState<AppState>(() =>
    typeof window !== 'undefined' ? loadState() : createDefaultState(),
  )
  const [overrideOpen, setOverrideOpen] = useState<Record<string, boolean>>({})
  const formId = useId()

  useEffect(() => {
    saveState(state)
  }, [state])

  const forecast = useMemo(() => projectForecast(state), [state])
  const months = useMemo(
    () => monthKeys(state.startMonth, state.forecastMonths),
    [state.startMonth, state.forecastMonths],
  )

  function reset() {
    const next = createDefaultState()
    setState(next)
    setOverrideOpen({})
  }

  function updatePayroll(id: string, patch: Partial<PayrollPosition>) {
    setState((s) => ({
      ...s,
      payroll: s.payroll.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }))
  }

  function addPayroll() {
    setState((s) => ({
      ...s,
      payroll: [
        ...s.payroll,
        { id: uid('pay'), name: 'New hire', monthlyAmount: 0 },
      ],
    }))
  }

  function removePayroll(id: string) {
    setState((s) => ({ ...s, payroll: s.payroll.filter((p) => p.id !== id) }))
  }

  function updateBucket(id: string, patch: Partial<ExpenseBucket>) {
    setState((s) => ({
      ...s,
      expenseBuckets: s.expenseBuckets.map((b) =>
        b.id === id ? { ...b, ...patch } : b,
      ),
    }))
  }

  function addBucket() {
    setState((s) => ({
      ...s,
      expenseBuckets: [
        ...s.expenseBuckets,
        {
          id: uid('exp'),
          name: 'New expense',
          monthlyAmount: 0,
          effectiveMonth: s.startMonth,
          overrides: {},
        },
      ],
    }))
  }

  function removeBucket(id: string) {
    setState((s) => ({
      ...s,
      expenseBuckets: s.expenseBuckets.filter((b) => b.id !== id),
    }))
  }

  function setBucketOverride(id: string, month: YearMonth, value: number | null) {
    setState((s) => ({
      ...s,
      expenseBuckets: s.expenseBuckets.map((b) => {
        if (b.id !== id) return b
        const overrides = { ...b.overrides }
        if (value === null) delete overrides[month]
        else overrides[month] = value
        return { ...b, overrides }
      }),
    }))
  }

  function setRevenueAmount(rowId: string, month: YearMonth, value: number) {
    setState((s) => ({
      ...s,
      revenueRows: s.revenueRows.map((r) =>
        r.id === rowId
          ? { ...r, amounts: { ...r.amounts, [month]: value } }
          : r,
      ),
    }))
  }

  function copyAcrossFuture(row: RevenueRow, fromMonth: YearMonth) {
    const value = Number(row.amounts[fromMonth]) || 0
    const fromIdx = months.indexOf(fromMonth)
    if (fromIdx < 0) return
    setState((s) => ({
      ...s,
      revenueRows: s.revenueRows.map((r) => {
        if (r.id !== row.id) return r
        const amounts = { ...r.amounts }
        for (let i = fromIdx; i < months.length; i++) {
          amounts[months[i]] = value
        }
        return { ...r, amounts }
      }),
    }))
  }

  function copyRowAcrossAll(row: RevenueRow) {
    const first = months[0]
    if (!first) return
    copyAcrossFuture(row, first)
  }

  const payrollTotal = state.payroll.reduce(
    (sum, p) => sum + (Number(p.monthlyAmount) || 0),
    0,
  )

  return (
    <div className="app">
      <header className="hero-band">
        <p className="brand">Prospect Technology</p>
        <h1>Cash Runway</h1>
        <p className="lede">
          Model payroll, expenses, collections, and funding to see how long cash
          lasts.
        </p>
      </header>

      <section className="summary-grid" aria-label="Runway summary">
        <article>
          <h2>Starting cash</h2>
          <p className="metric">{money(state.availableCash)}</p>
        </article>
        <article>
          <h2>Monthly expenses</h2>
          <p className="metric">{money(forecast.totalMonthlyExpenses)}</p>
          <p className="hint">Month 1 ({formatMonthLabel(state.startMonth)})</p>
        </article>
        <article>
          <h2>Operating net burn</h2>
          <p className="metric">{money(forecast.operatingNetBurn)}</p>
          <p className="hint">Expenses − op receipts − AR</p>
        </article>
        <article className="runway-card">
          <h2>Runway</h2>
          <p className="metric runway">{forecast.runway.label}</p>
          {forecast.runway.exhaustionMonth && (
            <p className="hint">
              Exhaustion: {formatMonthLabel(forecast.runway.exhaustionMonth)}
            </p>
          )}
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Assumptions</h2>
          <button type="button" className="btn ghost" onClick={reset}>
            Reset
          </button>
        </div>
        <div className="field-grid">
          <label>
            Available cash
            <input
              type="number"
              min={0}
              step={1}
              value={state.availableCash}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  availableCash: Number(e.target.value) || 0,
                }))
              }
            />
          </label>
          <label>
            Start month
            <input
              type="month"
              value={state.startMonth}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  startMonth: e.target.value || s.startMonth,
                }))
              }
            />
          </label>
          <label>
            Expected AR
            <input
              type="number"
              min={0}
              step={1}
              value={state.expectedAR}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  expectedAR: Number(e.target.value) || 0,
                }))
              }
            />
          </label>
          <label>
            AR collection month
            <input
              type="month"
              value={state.arCollectionMonth}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  arCollectionMonth: e.target.value || s.arCollectionMonth,
                }))
              }
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Payroll</h2>
          <button type="button" className="btn" onClick={addPayroll}>
            Add position
          </button>
        </div>
        <ul className="payroll-list">
          {state.payroll.map((p) => (
            <li key={p.id}>
              <input
                className="name-input"
                value={p.name}
                aria-label="Name"
                onChange={(e) => updatePayroll(p.id, { name: e.target.value })}
              />
              <input
                type="range"
                min={0}
                max={25000}
                step={100}
                value={Math.min(25000, Math.max(0, p.monthlyAmount))}
                aria-label={`${p.name} salary slider`}
                onChange={(e) =>
                  updatePayroll(p.id, {
                    monthlyAmount: Number(e.target.value) || 0,
                  })
                }
              />
              <input
                type="number"
                min={0}
                step={100}
                value={p.monthlyAmount}
                aria-label={`${p.name} salary`}
                onChange={(e) =>
                  updatePayroll(p.id, {
                    monthlyAmount: Number(e.target.value) || 0,
                  })
                }
              />
              <button
                type="button"
                className="btn ghost danger"
                onClick={() => removePayroll(p.id)}
                aria-label={`Remove ${p.name}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <p className="total-line">
          Payroll total: <strong>{money(payrollTotal)}</strong>
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Expense buckets</h2>
          <button type="button" className="btn" onClick={addBucket}>
            Add bucket
          </button>
        </div>
        <ul className="bucket-list">
          {state.expenseBuckets.map((b) => {
            const open = Boolean(overrideOpen[b.id])
            return (
              <li key={b.id} className="bucket-row">
                <div className="bucket-main">
                  <input
                    className="name-input"
                    value={b.name}
                    onChange={(e) =>
                      updateBucket(b.id, { name: e.target.value })
                    }
                  />
                  <label>
                    Amount
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={b.monthlyAmount}
                      onChange={(e) =>
                        updateBucket(b.id, {
                          monthlyAmount: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </label>
                  <label>
                    Effective
                    <input
                      type="month"
                      value={b.effectiveMonth}
                      onChange={(e) =>
                        updateBucket(b.id, {
                          effectiveMonth: e.target.value || b.effectiveMonth,
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() =>
                      setOverrideOpen((o) => ({ ...o, [b.id]: !open }))
                    }
                  >
                    {open ? 'Hide overrides' : 'Overrides'}
                  </button>
                  <button
                    type="button"
                    className="btn ghost danger"
                    onClick={() => removeBucket(b.id)}
                  >
                    Remove
                  </button>
                </div>
                {open && (
                  <div className="override-grid">
                    {months.map((m) => {
                      const has = Object.prototype.hasOwnProperty.call(
                        b.overrides,
                        m,
                      )
                      return (
                        <label key={m}>
                          <span>{formatMonthLabel(m)}</span>
                          <input
                            type="number"
                            placeholder={String(
                              m < b.effectiveMonth ? 0 : b.monthlyAmount,
                            )}
                            value={has ? b.overrides[m] : ''}
                            onChange={(e) => {
                              const raw = e.target.value
                              if (raw === '') setBucketOverride(b.id, m, null)
                              else
                                setBucketOverride(
                                  b.id,
                                  m,
                                  Number(raw) || 0,
                                )
                            }}
                          />
                        </label>
                      )
                    })}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Revenue &amp; funding</h2>
          <p className="hint">
            Edit cells; use → to copy a value across future months. Funding is
            tracked separately from operating receipts.
          </p>
        </div>
        <div className="table-scroll">
          <table className="data-table revenue-table">
            <thead>
              <tr>
                <th scope="col">Stream</th>
                {months.map((m) => (
                  <th key={m} scope="col">
                    {formatMonthLabel(m)}
                  </th>
                ))}
                <th scope="col">Row</th>
              </tr>
            </thead>
            <tbody>
              {state.revenueRows.map((row) => (
                <tr
                  key={row.id}
                  className={row.isFunding ? 'funding-row' : undefined}
                >
                  <th scope="row">
                    {row.name}
                    {row.isFunding && <span className="tag">Funding</span>}
                  </th>
                  {months.map((m) => (
                    <td key={m}>
                      <div className="cell-edit">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          aria-label={`${row.name} ${m}`}
                          value={row.amounts[m] ?? ''}
                          placeholder="0"
                          onChange={(e) =>
                            setRevenueAmount(
                              row.id,
                              m,
                              e.target.value === ''
                                ? 0
                                : Number(e.target.value) || 0,
                            )
                          }
                        />
                        <button
                          type="button"
                          className="btn icon"
                          title="Copy across future months"
                          aria-label={`Copy ${row.name} from ${m} across future`}
                          onClick={() => copyAcrossFuture(row, m)}
                        >
                          →
                        </button>
                      </div>
                    </td>
                  ))}
                  <td>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => copyRowAcrossAll(row)}
                    >
                      Fill all
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Ending cash</h2>
        </div>
        <CashChart months={forecast.months} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Monthly projection</h2>
        </div>
        <div className="table-scroll">
          <table className="data-table" id={`${formId}-monthly`}>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Beginning</th>
                <th scope="col">Op receipts</th>
                <th scope="col">AR</th>
                <th scope="col">Funding</th>
                <th scope="col">Expenses</th>
                <th scope="col">Ending</th>
              </tr>
            </thead>
            <tbody>
              {forecast.months.map((m) => (
                <tr
                  key={m.month}
                  className={m.endingCash < 0 ? 'shortfall' : undefined}
                >
                  <th scope="row">{formatMonthLabel(m.month)}</th>
                  <td>{money(m.beginningCash)}</td>
                  <td>{money(m.operatingReceipts)}</td>
                  <td>{money(m.arCollections)}</td>
                  <td>{money(m.funding)}</td>
                  <td>{money(m.expenses)}</td>
                  <td>{money(m.endingCash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="footnote">
          Next month start: {formatMonthLabel(addMonths(state.startMonth, 1))} ·
          Forecast horizon {state.forecastMonths} months
        </p>
      </section>
    </div>
  )
}
