/**
 * Pure-JS mirror of src/lib/calc.ts + defaults for Node verification.
 * Keep in sync with the TypeScript sources when changing forecast rules.
 */

function addMonths(ym, delta) {
  const [ys, ms] = ym.split('-')
  const y = Number(ys)
  const m = Number(ms)
  const idx = y * 12 + (m - 1) + delta
  const ny = Math.floor(idx / 12)
  const nm = (idx % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

function monthKeys(start, n) {
  const keys = []
  for (let i = 0; i < n; i++) keys.push(addMonths(start, i))
  return keys
}

function cmpYm(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

function expenseForBucket(bucket, month) {
  if (Object.prototype.hasOwnProperty.call(bucket.overrides, month)) {
    return Number(bucket.overrides[month]) || 0
  }
  if (cmpYm(month, bucket.effectiveMonth) < 0) return 0
  return Number(bucket.monthlyAmount) || 0
}

function totalExpenses(state, month) {
  const payroll = state.payroll.reduce(
    (sum, p) => sum + (Number(p.monthlyAmount) || 0),
    0,
  )
  const buckets = state.expenseBuckets.reduce(
    (sum, b) => sum + expenseForBucket(b, month),
    0,
  )
  return payroll + buckets
}

function operatingReceipts(state, month) {
  return state.revenueRows
    .filter((r) => !r.isFunding)
    .reduce((sum, r) => sum + (Number(r.amounts[month]) || 0), 0)
}

function fundingReceipts(state, month) {
  return state.revenueRows
    .filter((r) => r.isFunding)
    .reduce((sum, r) => sum + (Number(r.amounts[month]) || 0), 0)
}

function arCollections(state, month) {
  if (month === state.arCollectionMonth) return Number(state.expectedAR) || 0
  return 0
}

function computeRunway(months) {
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
    return {
      kind: 'twelve-plus',
      label: '12+ months',
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

function projectForecast(state) {
  const keys = monthKeys(state.startMonth, state.forecastMonths)
  const projections = []
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
  return {
    months: projections,
    totalMonthlyExpenses: first ? first.expenses : 0,
    operatingNetBurn: first ? first.operatingNetBurn : 0,
    runway: computeRunway(projections),
  }
}

function createDefaultState() {
  const startMonth = '2026-11'
  const payrollNames = [
    'Brent',
    'Chris',
    'Chase',
    'Fish',
    'Tommy',
    'Shanna',
    'Leslie',
  ]
  const expenseNames = [
    'Payroll taxes and benefits',
    'Vurb service contract',
    'Commission/draw',
    'Fixed overhead',
    'Marketing',
    'Technology',
    'Other expenses',
  ]
  const revenueDefs = [
    { name: 'Prospect advertising', isFunding: false },
    { name: 'Prospect Pro', isFunding: false },
    { name: 'Enterprise partnership', isFunding: false },
    { name: 'Funding', isFunding: true },
  ]

  return {
    startMonth,
    availableCash: 142135,
    expectedAR: 7915,
    arCollectionMonth: '2026-11',
    forecastMonths: 12,
    payroll: payrollNames.map((name, i) => ({
      id: `pay-${i}`,
      name,
      monthlyAmount: 0,
    })),
    expenseBuckets: expenseNames.map((name, i) => ({
      id: `exp-${i}`,
      name,
      monthlyAmount: 0,
      effectiveMonth: startMonth,
      overrides: {},
    })),
    revenueRows: revenueDefs.map((d, i) => ({
      id: `rev-${i}`,
      name: d.name,
      amounts: {},
      isFunding: d.isFunding,
    })),
  }
}

let failed = 0

function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error(`FAIL: ${msg}`)
  } else {
    console.log(`PASS: ${msg}`)
  }
}

function assertClose(a, b, msg) {
  assert(Math.abs(a - b) < 1e-9, `${msg} (got ${a}, expected ${b})`)
}

// --- Test 1: hand-checked 3-month roll-forward ---
{
  const state = {
    startMonth: '2026-11',
    availableCash: 10000,
    expectedAR: 1000,
    arCollectionMonth: '2026-11',
    forecastMonths: 3,
    payroll: [{ id: 'p1', name: 'A', monthlyAmount: 3000 }],
    expenseBuckets: [
      {
        id: 'e1',
        name: 'Overhead',
        monthlyAmount: 2000,
        effectiveMonth: '2026-11',
        overrides: {},
      },
    ],
    revenueRows: [
      {
        id: 'r1',
        name: 'Ads',
        isFunding: false,
        amounts: { '2026-11': 500, '2026-12': 500, '2027-01': 500 },
      },
      {
        id: 'r2',
        name: 'Funding',
        isFunding: true,
        amounts: { '2026-12': 4000 },
      },
    ],
  }

  const f = projectForecast(state)
  assert(f.months.length === 3, 'roll-forward has 3 months')

  // Nov: begin 10000 + op 500 + AR 1000 + fund 0 - exp 5000 = 6500
  assertClose(f.months[0].beginningCash, 10000, 'Nov beginning')
  assertClose(f.months[0].operatingReceipts, 500, 'Nov op receipts')
  assertClose(f.months[0].arCollections, 1000, 'Nov AR')
  assertClose(f.months[0].funding, 0, 'Nov funding')
  assertClose(f.months[0].expenses, 5000, 'Nov expenses')
  assertClose(f.months[0].endingCash, 6500, 'Nov ending')

  // Dec: begin 6500 + 500 + 0 + 4000 - 5000 = 6000
  assertClose(f.months[1].beginningCash, 6500, 'Dec beginning')
  assertClose(f.months[1].arCollections, 0, 'Dec AR is zero')
  assertClose(f.months[1].funding, 4000, 'Dec funding')
  assertClose(f.months[1].endingCash, 6000, 'Dec ending')

  // Jan: begin 6000 + 500 + 0 + 0 - 5000 = 1500
  assertClose(f.months[2].beginningCash, 6000, 'Jan beginning')
  assertClose(f.months[2].endingCash, 1500, 'Jan ending')
}

// --- Test 2: zero expenses → No cash burn, no NaN ---
{
  const state = createDefaultState()
  const f = projectForecast(state)
  assert(f.runway.kind === 'no-burn', 'zero expenses → no-burn kind')
  assert(f.runway.label === 'No cash burn', 'zero expenses → No cash burn label')
  assert(f.runway.exhaustionMonth === null, 'no exhaustion month')
  for (const m of f.months) {
    assert(Number.isFinite(m.endingCash), `endingCash finite for ${m.month}`)
    assert(Number.isFinite(m.operatingNetBurn), `burn finite for ${m.month}`)
    assert(!Number.isNaN(m.endingCash), `endingCash not NaN for ${m.month}`)
  }
  assert(Number.isFinite(f.runway.months) || f.runway.months === Infinity, 'runway months finite or Infinity')
  assert(!Number.isNaN(f.runway.months), 'runway months not NaN')
}

// --- Test 3: AR appears in exactly one month; moving collection moves AR ---
{
  const state = createDefaultState()
  state.expectedAR = 7915
  state.arCollectionMonth = '2026-11'
  state.forecastMonths = 12

  let f = projectForecast(state)
  const withAr = f.months.filter((m) => m.arCollections > 0)
  assert(withAr.length === 1, 'AR in exactly one month')
  assert(withAr[0].month === '2026-11', 'AR in Nov 2026')
  assertClose(withAr[0].arCollections, 7915, 'AR amount 7915')

  const totalAr = f.months.reduce((s, m) => s + m.arCollections, 0)
  assertClose(totalAr, 7915, 'AR not double-counted across forecast')

  // AR is not in starting cash (beginning of month 1 equals availableCash)
  assertClose(f.months[0].beginningCash, state.availableCash, 'AR not in starting cash')

  state.arCollectionMonth = '2027-02'
  f = projectForecast(state)
  const moved = f.months.filter((m) => m.arCollections > 0)
  assert(moved.length === 1, 'moved AR still exactly one month')
  assert(moved[0].month === '2027-02', 'AR moved to Feb 2027')
  assertClose(moved[0].arCollections, 7915, 'moved AR amount')
  assertClose(
    f.months.reduce((s, m) => s + m.arCollections, 0),
    7915,
    'moved AR no double count',
  )
  assertClose(f.months[0].arCollections, 0, 'Nov no longer has AR')
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}

console.log('\nAll verify checks passed.')
