import type { AppState } from './types'

function id(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function createDefaultState(): AppState {
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
  const revenueDefs: { name: string; isFunding: boolean }[] = [
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
    payroll: payrollNames.map((name) => ({
      id: id('pay'),
      name,
      monthlyAmount: 0,
    })),
    expenseBuckets: expenseNames.map((name) => ({
      id: id('exp'),
      name,
      monthlyAmount: 0,
      effectiveMonth: startMonth,
      overrides: {},
    })),
    revenueRows: revenueDefs.map(({ name, isFunding }) => ({
      id: id('rev'),
      name,
      amounts: {},
      isFunding,
    })),
  }
}
