import {
  computeBurnBudget,
  formatMonthLabel,
  monthKeys,
  normalizeHorizon,
  projectForecast,
} from './calc'
import type {
  AppState,
  BurnBudget,
  ForecastResult,
} from './types'

/** CSV cell: plain numbers for currency; strings for labels. */
export type CsvCell = string | number
export type CsvRow = CsvCell[]

export interface BuildExportOptions {
  /** Override clock for stable filenames / “as of” in print. */
  asOf?: Date
  forecast?: ForecastResult
  burnBudget?: BurnBudget
}

export interface ExportPayload {
  scenarioName: string
  /** e.g. prospect-runway-base-20261023.csv */
  filename: string
  rows: CsvRow[]
  csv: string
  printHtml: string
}

/** Sanitize scenario name for filenames: lowercase kebab, ASCII-ish. */
export function slugifyScenario(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'scenario'
}

/** Format date as YYYYMMDD in local calendar. */
export function formatExportDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

export function exportCsvFilename(scenarioName: string, asOf: Date = new Date()): string {
  return `prospect-runway-${slugifyScenario(scenarioName)}-${formatExportDate(asOf)}.csv`
}

/** Escape a single CSV field (RFC-style quotes when needed). */
export function escapeCsvCell(cell: CsvCell): string {
  if (typeof cell === 'number') {
    if (!Number.isFinite(cell)) return ''
    return String(cell)
  }
  const s = cell ?? ''
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function rowsToCsv(rows: CsvRow[]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n') + '\n'
}

function num(n: unknown): number {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

function sectionTitle(title: string): CsvRow[] {
  return [[title], []]
}

/**
 * Build export rows from the active scenario’s current AppState.
 * Uses projectForecast / computeBurnBudget (or injected results) so
 * adjusted inputs — not defaults — drive every section.
 */
export function buildExportRows(
  state: AppState,
  scenarioName: string,
  options: BuildExportOptions = {},
): CsvRow[] {
  const forecast = options.forecast ?? projectForecast(state)
  const burnBudget =
    options.burnBudget ??
    computeBurnBudget(state, forecast.operatingNetBurn)
  const horizon = normalizeHorizon(state.forecastMonths)
  const keys = monthKeys(state.startMonth, horizon)
  const rows: CsvRow[] = []

  rows.push(...sectionTitle('Assumptions'))
  rows.push(['Field', 'Value'])
  rows.push(['Scenario', scenarioName])
  rows.push(['Start month', state.startMonth])
  rows.push(['Available cash', num(state.availableCash)])
  rows.push(['A/R amount', num(state.expectedAR)])
  rows.push(['A/R collection month', state.arCollectionMonth])
  rows.push(['Planning horizon (months)', horizon])
  rows.push([])

  rows.push(...sectionTitle('Summary'))
  rows.push(['Field', 'Value'])
  rows.push(['Total mo.1 expenses', num(forecast.totalMonthlyExpenses)])
  rows.push(['Operating net burn', num(forecast.operatingNetBurn)])
  rows.push(['Runway', forecast.runway.label])
  rows.push(['Burn budget max monthly (cash ceiling)', num(burnBudget.cashCeiling)])
  if (burnBudget.arInHorizon && burnBudget.softCeiling > burnBudget.cashCeiling) {
    rows.push([
      'Burn budget soft ceiling (cash + A/R)',
      num(burnBudget.softCeiling),
    ])
  }
  rows.push(['Burn budget current (mo. 1)', num(burnBudget.currentBurn)])
  rows.push(['Burn budget remaining', num(burnBudget.remainingBudget)])
  rows.push(['Burn budget on track', burnBudget.onTrack ? 'yes' : 'no'])
  rows.push([])

  rows.push(...sectionTitle('Payroll'))
  rows.push(['Name', 'Monthly amount'])
  let payrollTotal = 0
  for (const p of state.payroll) {
    const amt = num(p.monthlyAmount)
    payrollTotal += amt
    rows.push([p.name, amt])
  }
  rows.push(['Total', payrollTotal])
  rows.push([])

  rows.push(...sectionTitle('Expense buckets'))
  rows.push(['Name', 'Monthly amount', 'Effective month'])
  for (const b of state.expenseBuckets) {
    rows.push([b.name, num(b.monthlyAmount), b.effectiveMonth])
  }
  rows.push([])

  rows.push(...sectionTitle('One-time expenses'))
  rows.push(['Name', 'Amount', 'Payment month'])
  const oneTimes = state.oneTimeExpenses ?? []
  if (oneTimes.length === 0) {
    rows.push(['(none)', 0, ''])
  } else {
    for (const e of oneTimes) {
      rows.push([e.name, num(e.amount), e.month])
    }
  }
  rows.push([])

  rows.push(...sectionTitle('Revenue & funding'))
  rows.push(['Name', 'Type', ...keys])
  for (const r of state.revenueRows) {
    rows.push([
      r.name,
      r.isFunding ? 'Funding' : 'Operating',
      ...keys.map((k) => num(r.amounts[k])),
    ])
  }
  rows.push([])

  rows.push(...sectionTitle('Monthly cash'))
  rows.push([
    'Month',
    'Beginning',
    'Operating receipts',
    'A/R',
    'Funding',
    'Expenses',
    'Ending',
    'Operating net burn',
  ])
  for (const m of forecast.months) {
    rows.push([
      m.month,
      num(m.beginningCash),
      num(m.operatingReceipts),
      num(m.arCollections),
      num(m.funding),
      num(m.expenses),
      num(m.endingCash),
      num(m.operatingNetBurn),
    ])
  }

  return rows
}

function moneyLabel(n: number): string {
  const abs = Math.abs(n)
  const formatted = abs.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
  return n < 0 ? `−${formatted}` : formatted
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Print / PDF-friendly HTML document (open in a window and window.print).
 * Currency shown with readable labels; mirrors CSV sections.
 */
export function buildPrintHtml(
  state: AppState,
  scenarioName: string,
  options: BuildExportOptions = {},
): string {
  const asOf = options.asOf ?? new Date()
  const forecast = options.forecast ?? projectForecast(state)
  const burnBudget =
    options.burnBudget ??
    computeBurnBudget(state, forecast.operatingNetBurn)
  const horizon = normalizeHorizon(state.forecastMonths)
  const keys = monthKeys(state.startMonth, horizon)

  const payrollTotal = state.payroll.reduce(
    (s, p) => s + num(p.monthlyAmount),
    0,
  )
  const oneTimes = state.oneTimeExpenses ?? []

  const payrollRows = state.payroll
    .map(
      (p) =>
        `<tr><td>${escHtml(p.name)}</td><td class="num">${escHtml(moneyLabel(num(p.monthlyAmount)))}</td></tr>`,
    )
    .join('')

  const bucketRows = state.expenseBuckets
    .map(
      (b) =>
        `<tr><td>${escHtml(b.name)}</td><td class="num">${escHtml(moneyLabel(num(b.monthlyAmount)))}</td><td>${escHtml(formatMonthLabel(b.effectiveMonth))}</td></tr>`,
    )
    .join('')

  const oneTimeRows =
    oneTimes.length === 0
      ? '<tr><td colspan="3">(none)</td></tr>'
      : oneTimes
          .map(
            (e) =>
              `<tr><td>${escHtml(e.name)}</td><td class="num">${escHtml(moneyLabel(num(e.amount)))}</td><td>${escHtml(formatMonthLabel(e.month))}</td></tr>`,
          )
          .join('')

  const revHeader = keys
    .map((k) => `<th>${escHtml(formatMonthLabel(k))}</th>`)
    .join('')
  const revRows = state.revenueRows
    .map((r) => {
      const cells = keys
        .map(
          (k) =>
            `<td class="num">${escHtml(moneyLabel(num(r.amounts[k])))}</td>`,
        )
        .join('')
      return `<tr><td>${escHtml(r.name)}</td><td>${r.isFunding ? 'Funding' : 'Operating'}</td>${cells}</tr>`
    })
    .join('')

  const cashRows = forecast.months
    .map(
      (m) =>
        `<tr>
          <td>${escHtml(formatMonthLabel(m.month))}</td>
          <td class="num">${escHtml(moneyLabel(num(m.beginningCash)))}</td>
          <td class="num">${escHtml(moneyLabel(num(m.operatingReceipts)))}</td>
          <td class="num">${escHtml(moneyLabel(num(m.arCollections)))}</td>
          <td class="num">${escHtml(moneyLabel(num(m.funding)))}</td>
          <td class="num">${escHtml(moneyLabel(num(m.expenses)))}</td>
          <td class="num">${escHtml(moneyLabel(num(m.endingCash)))}</td>
          <td class="num">${escHtml(moneyLabel(num(m.operatingNetBurn)))}</td>
        </tr>`,
    )
    .join('')

  const softLine =
    burnBudget.arInHorizon && burnBudget.softCeiling > burnBudget.cashCeiling
      ? `<tr><th>Soft ceiling (cash + A/R)</th><td class="num">${escHtml(moneyLabel(burnBudget.softCeiling))}</td></tr>`
      : ''

  const asOfLabel = asOf.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Prospect runway — ${escHtml(scenarioName)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #1a1a1a; margin: 1.5rem; line-height: 1.4; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  h2 { font-size: 1.1rem; margin: 1.5rem 0 0.5rem; border-bottom: 1px solid #ccc; padding-bottom: 0.25rem; }
  .meta { color: #555; margin: 0 0 1rem; font-size: 0.9rem; }
  table { border-collapse: collapse; width: 100%; margin: 0.5rem 0 1rem; font-size: 0.85rem; }
  th, td { border: 1px solid #ddd; padding: 0.35rem 0.5rem; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; font-weight: 600; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .kv th { width: 40%; }
  @media print {
    body { margin: 0.5in; }
    h2 { break-after: avoid; }
    table { break-inside: avoid; }
  }
</style>
</head>
<body>
  <h1>Prospect Cash Runway</h1>
  <p class="meta">Scenario: <strong>${escHtml(scenarioName)}</strong> · Exported ${escHtml(asOfLabel)}</p>

  <h2>Assumptions</h2>
  <table class="kv">
    <tr><th>Start month</th><td>${escHtml(formatMonthLabel(state.startMonth))}</td></tr>
    <tr><th>Available cash</th><td class="num">${escHtml(moneyLabel(num(state.availableCash)))}</td></tr>
    <tr><th>A/R amount</th><td class="num">${escHtml(moneyLabel(num(state.expectedAR)))}</td></tr>
    <tr><th>A/R collection month</th><td>${escHtml(formatMonthLabel(state.arCollectionMonth))}</td></tr>
    <tr><th>Planning horizon</th><td>${horizon} months</td></tr>
    <tr><th>Scenario</th><td>${escHtml(scenarioName)}</td></tr>
  </table>

  <h2>Summary</h2>
  <table class="kv">
    <tr><th>Total mo.1 expenses</th><td class="num">${escHtml(moneyLabel(forecast.totalMonthlyExpenses))}</td></tr>
    <tr><th>Operating net burn</th><td class="num">${escHtml(moneyLabel(forecast.operatingNetBurn))}</td></tr>
    <tr><th>Runway</th><td>${escHtml(forecast.runway.label)}</td></tr>
    <tr><th>Burn budget max monthly</th><td class="num">${escHtml(moneyLabel(burnBudget.cashCeiling))}</td></tr>
    ${softLine}
    <tr><th>Burn budget current</th><td class="num">${escHtml(moneyLabel(burnBudget.currentBurn))}</td></tr>
    <tr><th>Burn budget remaining</th><td class="num">${escHtml(moneyLabel(burnBudget.remainingBudget))}</td></tr>
    <tr><th>On track</th><td>${burnBudget.onTrack ? 'Yes' : 'No'}</td></tr>
  </table>

  <h2>Payroll</h2>
  <table>
    <thead><tr><th>Name</th><th class="num">Monthly amount</th></tr></thead>
    <tbody>${payrollRows}
    <tr><th>Total</th><td class="num"><strong>${escHtml(moneyLabel(payrollTotal))}</strong></td></tr>
    </tbody>
  </table>

  <h2>Expense buckets</h2>
  <table>
    <thead><tr><th>Name</th><th class="num">Monthly amount</th><th>Effective month</th></tr></thead>
    <tbody>${bucketRows}</tbody>
  </table>

  <h2>One-time expenses</h2>
  <table>
    <thead><tr><th>Name</th><th class="num">Amount</th><th>Payment month</th></tr></thead>
    <tbody>${oneTimeRows}</tbody>
  </table>

  <h2>Revenue &amp; funding</h2>
  <table>
    <thead><tr><th>Name</th><th>Type</th>${revHeader}</tr></thead>
    <tbody>${revRows}</tbody>
  </table>

  <h2>Monthly cash</h2>
  <table>
    <thead>
      <tr>
        <th>Month</th>
        <th class="num">Beginning</th>
        <th class="num">Operating receipts</th>
        <th class="num">A/R</th>
        <th class="num">Funding</th>
        <th class="num">Expenses</th>
        <th class="num">Ending</th>
        <th class="num">Operating net burn</th>
      </tr>
    </thead>
    <tbody>${cashRows}</tbody>
  </table>
</body>
</html>`
}

/** Assemble CSV + print HTML for the active scenario’s current state. */
export function buildExportPayload(
  state: AppState,
  scenarioName: string,
  options: BuildExportOptions = {},
): ExportPayload {
  const asOf = options.asOf ?? new Date()
  const forecast = options.forecast ?? projectForecast(state)
  const burnBudget =
    options.burnBudget ??
    computeBurnBudget(state, forecast.operatingNetBurn)
  const opts = { ...options, asOf, forecast, burnBudget }
  const rows = buildExportRows(state, scenarioName, opts)
  return {
    scenarioName,
    filename: exportCsvFilename(scenarioName, asOf),
    rows,
    csv: rowsToCsv(rows),
    printHtml: buildPrintHtml(state, scenarioName, opts),
  }
}

/** Trigger a browser download of CSV text. No-op outside the browser. */
export function downloadCsv(csv: string, filename: string): void {
  if (typeof document === 'undefined') return
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Open a print-friendly report. Prefers a new window + print; falls back to
 * a blob URL tab if popups are blocked.
 */
export function openPrintReport(html: string): void {
  if (typeof window === 'undefined') return
  const w = window.open('', '_blank')
  if (w) {
    w.document.open()
    w.document.write(html)
    w.document.close()
    // Defer print until layout settles
    w.focus()
    setTimeout(() => {
      try {
        w.print()
      } catch {
        /* ignore */
      }
    }, 250)
    return
  }
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}
