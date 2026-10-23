/**
 * Pure-JS mirror of src/lib/calc.ts + defaults for Node verification.
 * Keep in sync with the TypeScript sources when changing forecast rules.
 */

const PLANNING_HORIZONS = [3, 6, 7, 8, 9, 10, 11, 12]

function normalizeHorizon(n) {
  const v = typeof n === 'number' ? n : Number(n)
  if (PLANNING_HORIZONS.includes(v)) return v
  return 12
}

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

function oneTimeExpensesForMonth(state, month) {
  const rows = state.oneTimeExpenses ?? []
  return rows.reduce((sum, e) => {
    if (e.month !== month) return sum
    return sum + (Number(e.amount) || 0)
  }, 0)
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
  return payroll + buckets + oneTimeExpensesForMonth(state, month)
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
  const horizon = normalizeHorizon(state.forecastMonths)
  const keys = monthKeys(state.startMonth, horizon)
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

function computeBurnBudget(state, currentBurn) {
  const horizonMonths = normalizeHorizon(state.forecastMonths)
  const cash = Number(state.availableCash) || 0
  const ar = Number(state.expectedAR) || 0
  const keys = monthKeys(state.startMonth, horizonMonths)
  const arInHorizon = ar > 0 && keys.includes(state.arCollectionMonth)

  const cashCeiling = horizonMonths > 0 ? cash / horizonMonths : 0
  const softCeiling = arInHorizon ? (cash + ar) / horizonMonths : cashCeiling

  const burn =
    currentBurn !== undefined
      ? currentBurn
      : projectForecast(state).operatingNetBurn

  return {
    horizonMonths,
    cashCeiling,
    softCeiling,
    arInHorizon,
    currentBurn: burn,
    remainingBudget: cashCeiling - burn,
    onTrack: burn <= cashCeiling,
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
    oneTimeExpenses: [
      {
        id: 'ot-0',
        name: 'Data contract',
        amount: 0,
        month: startMonth,
      },
    ],
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
    oneTimeExpenses: [],
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

// --- Test 4: horizon toggle drives forecast length + runway label ---
{
  const state = createDefaultState()
  state.payroll[0].monthlyAmount = 5000
  for (const h of PLANNING_HORIZONS) {
    state.forecastMonths = h
    const f = projectForecast(state)
    assert(f.months.length === h, `forecast length ${h}`)
  }

  // Positive burn but cash lasts beyond a short horizon → horizon-plus label
  state.availableCash = 200000
  state.expectedAR = 0
  state.forecastMonths = 3
  state.payroll = [{ id: 'p', name: 'A', monthlyAmount: 10000 }]
  state.expenseBuckets = state.expenseBuckets.map((b) => ({
    ...b,
    monthlyAmount: 0,
  }))
  state.revenueRows = state.revenueRows.map((r) => ({ ...r, amounts: {} }))
  const short = projectForecast(state)
  assert(short.runway.kind === 'horizon-plus', 'short horizon no shortfall → horizon-plus')
  assert(short.runway.label === '3+ months', 'horizon-plus label uses 3')

  assert(normalizeHorizon(6) === 6, 'normalizeHorizon keeps 6')
  assert(normalizeHorizon(7) === 7, 'normalizeHorizon keeps 7')
  assert(normalizeHorizon(8) === 8, 'normalizeHorizon keeps 8')
  assert(normalizeHorizon(10) === 10, 'normalizeHorizon keeps 10')
  assert(normalizeHorizon(11) === 11, 'normalizeHorizon keeps 11')
  assert(normalizeHorizon(99) === 12, 'normalizeHorizon clamps invalid to 12')
  assert(normalizeHorizon('x') === 12, 'normalizeHorizon NaN → 12')
}

// --- Test 5: burn budget from available cash; AR soft band; remaining ---
{
  const state = createDefaultState()
  // ~142135 cash → 12 ≈ 11844.6; with AR in horizon soft ≈ 12504.2
  state.forecastMonths = 12
  state.payroll = state.payroll.map((p) => ({ ...p, monthlyAmount: 0 }))
  state.expenseBuckets = state.expenseBuckets.map((b) => ({
    ...b,
    monthlyAmount: 0,
  }))

  let budget = computeBurnBudget(state, 0)
  assertClose(budget.cashCeiling, 142135 / 12, '12mo cash ceiling')
  assert(budget.arInHorizon, 'default AR in 12mo horizon')
  assertClose(budget.softCeiling, (142135 + 7915) / 12, '12mo soft ceiling with AR')
  assertClose(budget.remainingBudget, 142135 / 12, 'remaining = ceiling − 0 burn')
  assert(budget.onTrack, 'zero burn is on track')

  state.forecastMonths = 3
  budget = computeBurnBudget(state, 0)
  assertClose(budget.cashCeiling, 142135 / 3, '3mo cash ceiling ≈47k')
  assertClose(budget.softCeiling, (142135 + 7915) / 3, '3mo soft ≈50k')

  state.forecastMonths = 6
  budget = computeBurnBudget(state, 20000)
  assertClose(budget.cashCeiling, 142135 / 6, '6mo cash ceiling ≈24k')
  assertClose(budget.remainingBudget, 142135 / 6 - 20000, 'remaining vs month-1 burn')
  assert(budget.onTrack, '20k under ~24k ceiling → on track')

  budget = computeBurnBudget(state, 30000)
  assert(!budget.onTrack, '30k over ~24k ceiling → over budget')

  // AR outside horizon: soft = cash only
  state.forecastMonths = 3
  state.arCollectionMonth = '2027-06'
  budget = computeBurnBudget(state, 0)
  assert(!budget.arInHorizon, 'AR outside 3mo horizon')
  assertClose(budget.softCeiling, budget.cashCeiling, 'no AR soft uplift when timed out')
}

// --- Test 6: one-time expense appears in exactly one month; moving month moves hit ---
{
  const state = createDefaultState()
  state.payroll = state.payroll.map((p) => ({ ...p, monthlyAmount: 0 }))
  state.expenseBuckets = state.expenseBuckets.map((b) => ({
    ...b,
    monthlyAmount: 0,
  }))
  state.revenueRows = state.revenueRows.map((r) => ({ ...r, amounts: {} }))
  state.expectedAR = 0
  state.forecastMonths = 12
  state.oneTimeExpenses = [
    {
      id: 'ot-dc',
      name: 'Data contract',
      amount: 8500,
      month: '2026-11',
    },
  ]

  let f = projectForecast(state)
  const withOt = f.months.filter((m) => m.expenses > 0)
  assert(withOt.length === 1, 'one-time expense in exactly one month')
  assert(withOt[0].month === '2026-11', 'one-time in Nov 2026')
  assertClose(withOt[0].expenses, 8500, 'one-time amount in Nov expenses')
  assertClose(
    f.months.reduce((s, m) => s + m.expenses, 0),
    8500,
    'one-time not double-counted across forecast',
  )
  assertClose(f.months[0].operatingNetBurn, 8500, 'one-time in month-1 operating burn')
  assertClose(f.totalMonthlyExpenses, 8500, 'month-1 total expenses includes one-time')

  // Ending cash: begin 142135 - 8500 = 133635 in Nov; later months flat
  assertClose(f.months[0].endingCash, 142135 - 8500, 'Nov ending after one-time')
  assertClose(f.months[1].expenses, 0, 'Dec has no one-time')
  assertClose(f.months[1].endingCash, 142135 - 8500, 'Dec ending unchanged (no burn)')

  // Move payment month → cash hit moves; not applied twice
  state.oneTimeExpenses = [
    {
      id: 'ot-dc',
      name: 'Data contract',
      amount: 8500,
      month: '2027-02',
    },
  ]
  f = projectForecast(state)
  const movedOt = f.months.filter((m) => m.expenses > 0)
  assert(movedOt.length === 1, 'moved one-time still exactly one month')
  assert(movedOt[0].month === '2027-02', 'one-time moved to Feb 2027')
  assertClose(movedOt[0].expenses, 8500, 'moved one-time amount')
  assertClose(
    f.months.reduce((s, m) => s + m.expenses, 0),
    8500,
    'moved one-time no double count',
  )
  assertClose(f.months[0].expenses, 0, 'Nov no longer has one-time')
  assertClose(f.totalMonthlyExpenses, 0, 'month-1 total excludes one-time when timed later')

  // Default seed: Data contract at $0 / start month
  const fresh = createDefaultState()
  assert(fresh.oneTimeExpenses.length >= 1, 'defaults include one-time list')
  assert(
    fresh.oneTimeExpenses.some((e) => e.name === 'Data contract'),
    'defaults seed Data contract',
  )
  const dc = fresh.oneTimeExpenses.find((e) => e.name === 'Data contract')
  assertClose(dc.amount, 0, 'Data contract default amount $0')
  assert(dc.month === fresh.startMonth, 'Data contract default month = start month')
}

// --- Test 7: multiple one-time expenses land in their own months ---
{
  const state = createDefaultState()
  state.payroll = state.payroll.map((p) => ({ ...p, monthlyAmount: 0 }))
  state.expenseBuckets = state.expenseBuckets.map((b) => ({
    ...b,
    monthlyAmount: 0,
  }))
  state.revenueRows = state.revenueRows.map((r) => ({ ...r, amounts: {} }))
  state.expectedAR = 0
  state.forecastMonths = 12
  state.oneTimeExpenses = [
    {
      id: 'ot-dc',
      name: 'Data contract',
      amount: 5000,
      month: '2026-11',
    },
    {
      id: 'ot-legal',
      name: 'Legal setup',
      amount: 2500,
      month: '2026-12',
    },
    {
      id: 'ot-equip',
      name: 'Equipment',
      amount: 1200,
      month: '2027-02',
    },
  ]

  const f = projectForecast(state)
  assertClose(f.months[0].expenses, 5000, 'Nov gets Data contract only')
  assertClose(f.months[1].expenses, 2500, 'Dec gets Legal setup only')
  assertClose(f.months[2].expenses, 0, 'Jan has no one-time')
  assertClose(f.months[3].expenses, 1200, 'Feb gets Equipment only')
  assertClose(
    f.months.reduce((s, m) => s + m.expenses, 0),
    5000 + 2500 + 1200,
    'multi one-time sum once across forecast',
  )
  assertClose(f.totalMonthlyExpenses, 5000, 'month-1 total is Data contract only')
  assertClose(
    f.months[0].endingCash,
    142135 - 5000,
    'Nov ending after Data contract',
  )
  assertClose(
    f.months[1].endingCash,
    142135 - 5000 - 2500,
    'Dec ending after Legal',
  )
  assertClose(
    f.months[3].endingCash,
    142135 - 5000 - 2500 - 1200,
    'Feb ending after Equipment',
  )

  // Two items in the same month sum together
  state.oneTimeExpenses = [
    {
      id: 'ot-a',
      name: 'Data contract',
      amount: 3000,
      month: '2026-11',
    },
    {
      id: 'ot-b',
      name: 'Launch fee',
      amount: 700,
      month: '2026-11',
    },
  ]
  const same = projectForecast(state)
  assertClose(same.months[0].expenses, 3700, 'same-month one-times sum')
  assertClose(same.months[1].expenses, 0, 'other months stay zero')
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}

console.log('\nAll verify checks passed.')
