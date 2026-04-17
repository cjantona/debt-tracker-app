import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { checkConnection, dbLoad, dbSave } from './lib/db'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const STORAGE_KEY = 'debt-tracker:v1'
const SEED_VERSION = 5 // bump this whenever seedDebts changes

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

const EMPTY_DEBT_DRAFT = {
  id: '',
  name: '',
  bank: '',
  totalBalance: '',
  remainingBalance: '',
  monthlyPayment: '',
  monthsRemaining: '',
  interestRate: '',
  minDue: '',
  financeCharge: '',
  minDueRate: '0.03',
}

const seedDebts = [
  {
    id: 'sloan',
    name: 'SLoan',
    bank: 'Shopee',
    totalBalance: 48000,
    remainingBalance: 48000,
    monthlyPayment: 9600,
    monthsRemaining: 5,
    interestRate: 0.17,
    minDue: 0,
    financeCharge: 0,
    fixedInstallment: true,
    minDueRate: 0.03,
    paymentHistory: [],
    dueDate: 1,
    creditorContacts: { phone: '1800-SHOPEE', email: 'support@shopee.ph', website: 'shopee.ph' },
  },
  {
    id: 'rcbc-cc',
    name: 'RCBC Credit Card',
    bank: 'RCBC',
    totalBalance: 48397.01,
    remainingBalance: 48397.01,
    monthlyPayment: 1452,
    monthsRemaining: 18,
    interestRate: 0.02,
    minDue: 1452,
    financeCharge: 0,
    minDueRate: 0.03,
    paymentHistory: [],
    dueDate: 10,
    creditorContacts: { phone: '1800-888-8822', email: 'cc@rcbc.com', website: 'rcbc.com' },
  },
  {
    id: 'bpi-mastercard',
    name: 'BDO Platinum Mastercard',
    bank: 'BDO',
    totalBalance: 24843.34,
    remainingBalance: 24843.34,
    monthlyPayment: 7000,
    monthsRemaining: 12,
    interestRate: 0.02,
    minDue: 0,
    financeCharge: 396.08,
    minDueRate: 0.03,
    paymentHistory: [],
    dueDate: 18,
    creditorContacts: { phone: '1800-188-1919', email: 'cards@bdo.com.ph', website: 'bdo.com.ph' },
  },
  {
    id: 'gloan-a',
    name: 'GCash GLoan A',
    bank: 'GCash',
    totalBalance: 33957,
    remainingBalance: 33957,
    monthlyPayment: 3773,
    monthsRemaining: 9,
    interestRate: 0.15,
    minDue: 0,
    financeCharge: 0,
    fixedInstallment: true,
    minDueRate: 0.05,
    paymentHistory: [],
    dueDate: 5,
    creditorContacts: { phone: '2882-1111', email: 'support@gcash.com', website: 'gcash.com' },
  },
  {
    id: 'gloan-b',
    name: 'GCash GLoan B',
    bank: 'GCash',
    totalBalance: 34800,
    remainingBalance: 34800,
    monthlyPayment: 2900,
    monthsRemaining: 12,
    interestRate: 0.14,
    minDue: 0,
    financeCharge: 0,
    fixedInstallment: true,
    minDueRate: 0.05,
    paymentHistory: [],
    dueDate: 10,
    creditorContacts: { phone: '2882-1111', email: 'support@gcash.com', website: 'gcash.com' },
  },
  {
    id: 'bdo-conv',
    name: 'BDO JCB Balance Conv',
    bank: 'BDO',
    totalBalance: 18658,
    remainingBalance: 18658,
    monthlyPayment: 1865,
    monthsRemaining: 9,
    interestRate: 0.11,
    minDue: 1865,
    financeCharge: 0,
    minDueRate: 0.03,
    paymentHistory: [],
    dueDate: 15,
    creditorContacts: { phone: '1800-188-1919', email: 'cards@bdo.com.ph', website: 'bdo.com.ph' },
  },
  {
    id: 'bdo-plat',
    name: 'BPI Platinum',
    bank: 'BPI',
    totalBalance: 750391.31,
    remainingBalance: 750391.31,
    monthlyPayment: 31769.61,
    monthsRemaining: 24,
    interestRate: 0.02,
    minDue: 850,
    financeCharge: 0,
    minDueRate: 0.03,
    paymentHistory: [],
    dueDate: 20,
    creditorContacts: { phone: '1800-665-3333', email: 'cards@bpi.com.ph', website: 'bpi.com.ph' },
  },
]

const seedSettings = {
  biMonthlySalary: 25000,
  monthlyBudgetOverride: '',
  manualExtra: 5000,
  strategy: 'cashflow',
  interestBoost: true,
  projectedIncome: [
    { month: 5, year: 2026, amount: 50000 },
    { month: 12, year: 2026, amount: 75000 },
  ],
}

function formatCurrency(value) {
  return currency.format(Math.max(0, value))
}

function getStatus(debt) {
  if (debt.remainingBalance <= 0) {
    return 'paid'
  }
  if (debt.monthlyPayment >= 6000 || debt.monthsRemaining >= 14) {
    return 'heavy'
  }
  return 'ongoing'
}

function scoreDebt(debt, strategy, income, interestBoost) {
  if (debt.remainingBalance <= 0) {
    return -1
  }
  if (strategy === 'snowball') {
    return 100000 - debt.remainingBalance
  }
  if (strategy === 'interest') {
    return debt.interestRate * 1000 + debt.monthlyPayment
  }
  const burden = debt.monthlyPayment / Math.max(1, income)
  const interestScore = interestBoost ? debt.interestRate * 100 : 0
  return debt.monthlyPayment * 3 + debt.monthsRemaining * 9 + burden * 500 + interestScore
}

function buildBurnDown(debts, strategy, totalMonthlyBudget, income, interestBoost) {
  const working = debts
    .filter((debt) => debt.remainingBalance > 0)
    .map((debt) => ({ ...debt }))

  const points = [
    {
      month: 'Month 0',
      remaining: working.reduce((sum, debt) => sum + debt.remainingBalance, 0),
    },
  ]

  for (let month = 1; month <= 120 && working.some((debt) => debt.remainingBalance > 0); month += 1) {
    const baseTotal = working.reduce(
      (sum, debt) => sum + Math.min(debt.monthlyPayment, debt.remainingBalance),
      0,
    )

    let extraPool = Math.max(0, totalMonthlyBudget - baseTotal)

    const ranked = [...working]
      .filter((debt) => debt.remainingBalance > 0)
      .sort(
        (a, b) =>
          scoreDebt(b, strategy, income, interestBoost) -
          scoreDebt(a, strategy, income, interestBoost),
      )

    for (const debt of ranked) {
      if (debt.remainingBalance <= 0) {
        continue
      }
      const basePayment = Math.min(debt.monthlyPayment, debt.remainingBalance)
      const room = Math.max(0, debt.remainingBalance - basePayment)
      const extraPayment = Math.min(extraPool, room)
      debt.remainingBalance -= basePayment + extraPayment
      extraPool -= extraPayment
    }

    const totalRemaining = working.reduce(
      (sum, debt) => sum + Math.max(0, debt.remainingBalance),
      0,
    )

    points.push({
      month: `Month ${month}`,
      remaining: totalRemaining,
    })
  }

  return points
}

function buildAssistantReply(question, context) {
  const lower = question.toLowerCase()
  const {
    topTarget,
    safeExtraAllowed,
    fixedPayments,
    appliedExtra,
    debtFreeMonth,
    safeRuleBreached,
    totalIncome,
    remainingDisposable,
  } = context

  if (lower.includes('what should i pay') || lower.includes('pay next')) {
    return topTarget
      ? `Focus on ${topTarget.name} first. It has the strongest cashflow burden score for this month.`
      : 'You are fully paid off. Keep emergency savings as your next focus.'
  }

  if (lower.includes('afford')) {
    const amount = Number((lower.match(/\d+[\d,]*/)?.[0] || '0').replace(/,/g, ''))
    const obligations = fixedPayments + amount
    const safeLimit = totalIncome * 0.5
    if (obligations <= safeLimit) {
      return `Yes. ${formatCurrency(amount)} extra is within your safe range. You still keep at least 50% of salary.`
    }
    return `Not safely. ${formatCurrency(amount)} extra would break the 50% salary rule. Try up to ${formatCurrency(
      safeExtraAllowed,
    )} instead.`
  }

  if (lower.includes('debt free') || lower.includes('when will i finish')) {
    return `At your current plan, you become debt free in about month ${debtFreeMonth}.`
  }

  if (lower.includes('safe') || lower.includes('50%')) {
    if (safeRuleBreached) {
      return `You are above the safe threshold. Keep fixed + extra to ${formatCurrency(
        totalIncome * 0.5,
      )} max. Current disposable left: ${formatCurrency(remainingDisposable)}.`
    }
    return `You are inside the 50% safety rule. Current disposable left: ${formatCurrency(remainingDisposable)}.`
  }

  return `Suggested focus: ${topTarget?.name || 'no active debt'}, extra payment cap ${formatCurrency(
    safeExtraAllowed,
  )}, currently applying ${formatCurrency(appliedExtra)}.`
}

function NumInput({ value, onChange }) {
  return (
    <input
      type="number"
      value={Number(value) || 0}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
      className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-right text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
    />
  )
}

function MinPaymentPlanner({ debts, onUpdateDebt, onMarkPayment }) {
    const roundToNearest1000 = (n) => Math.ceil((Number(n) || 0) / 1000) * 1000

    const calcProjectedMinDue = (debt) => {
      if (debt.fixedInstallment) return 0
      const balance = Number(debt.remainingBalance) || 0
      const rate = Number(debt.minDueRate) || 0.03
      return Math.max(0, balance * rate)
    }

    const activeDebts = [...debts]
      .filter((d) => d.remainingBalance > 0)
      .sort((a, b) => {
        const aFixed = a.fixedInstallment ? 1 : 0
        const bFixed = b.fixedInstallment ? 1 : 0
        if (aFixed !== bFixed) return aFixed - bFixed
        return b.remainingBalance - a.remainingBalance
      })

    const rows = activeDebts.map((d) => {
      const minDue = Number(d.minDue) || 0
      const fc = Number(d.financeCharge) || 0
      const combined = minDue + fc
      const rounded = roundToNearest1000(combined)
      const projMin = calcProjectedMinDue(d)
      const projRounded = roundToNearest1000(projMin)
      return { debt: d, minDue, fc, combined, rounded, projMin, projRounded }
    })

    const totals = rows.reduce(
      (acc, r) => {
        if (r.debt.fixedInstallment) return acc
        acc.minDue += r.minDue
        acc.fc += r.fc
        acc.combined += r.combined
        acc.rounded += r.rounded
        acc.projMin += r.projMin
        acc.projRounded += r.projRounded
        return acc
      },
      { minDue: 0, fc: 0, combined: 0, rounded: 0, projMin: 0, projRounded: 0 },
    )

    return (
      <section className="mt-5 rounded-2xl border border-slate-700/60 bg-slate-800/70 p-4 shadow-xl shadow-slate-950/30">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">Minimum Payment Planner</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Enter Min Due + Finance Charge per card. Projected assumes no new CC spend next month.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-right">
              <p className="text-xs uppercase tracking-widest text-cyan-400">This Month Rounded</p>
              <p className="mono text-xl font-bold text-cyan-200">{formatCurrency(totals.rounded)}</p>
            </div>
            <div className="rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-right">
              <p className="text-xs uppercase tracking-widest text-violet-400">Next Month Projected</p>
              <p className="mono text-xl font-bold text-violet-200">{formatCurrency(totals.projRounded)}</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase tracking-[0.12em] text-slate-400">
                <th className="pb-2 text-left">Debt / Bank</th>
                <th className="pb-2 text-right">Balance</th>
                <th className="pb-2 text-right">Min Due</th>
                <th className="pb-2 text-right">Finance Charge</th>
                <th className="pb-2 text-right">Min + FC</th>
                <th className="pb-2 text-right">Rounded (PHP1k)</th>
                <th className="pb-2 text-right">Min Due %</th>
                <th className="pb-2 text-right bg-violet-500/10 rounded-tl">Proj Min Due</th>
                <th className="pb-2 text-right bg-violet-500/10 rounded-tr">Proj Rounded</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ debt, minDue, fc, combined, rounded, projMin, projRounded }) => (
                <tr key={debt.id} className="border-b border-slate-800/80">
                  <td className="py-2.5 pr-3">
                    <p className="font-semibold text-slate-100">{debt.name}</p>
                    <p className="text-xs text-slate-400">{debt.bank}</p>
                    {debt.fixedInstallment && (
                      <span className="mt-0.5 inline-block rounded-full border border-slate-500/60 bg-slate-700/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                        fixed · no extra
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 mono text-slate-200">{formatCurrency(debt.remainingBalance)}</td>
                  <td className="py-2 pr-2 w-32">
                    {debt.fixedInstallment ? (
                      <p className="text-right text-sm text-slate-500 italic pr-1">—</p>
                    ) : (
                      <NumInput
                        value={minDue}
                        onChange={(val) => onUpdateDebt(debt.id, 'minDue', val)}
                      />
                    )}
                  </td>
                  <td className="py-2 pr-2 w-32">
                    {debt.fixedInstallment ? (
                      <p className="text-right text-sm text-slate-500 italic pr-1">—</p>
                    ) : (
                      <NumInput
                        value={fc}
                        onChange={(val) => onUpdateDebt(debt.id, 'financeCharge', val)}
                      />
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right mono text-slate-100">
                    {debt.fixedInstallment ? <span className="text-slate-500">—</span> : formatCurrency(combined)}
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    {debt.fixedInstallment ? (
                      <span className="text-slate-500 text-sm">—</span>
                    ) : (
                      <span className="inline-block rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-2 py-1 mono font-semibold text-emerald-200">
                        {formatCurrency(rounded)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-2 w-24">
                    {debt.fixedInstallment ? (
                      <p className="text-right text-sm text-slate-500 italic pr-1">—</p>
                    ) : (
                      <>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={Number(debt.minDueRate) || 0.03}
                          onChange={(e) => onUpdateDebt(debt.id, 'minDueRate', Number(e.target.value) || 0.03)}
                          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-right text-sm text-slate-100 focus:border-violet-500 focus:outline-none"
                        />
                        <p className="mt-0.5 text-center text-[10px] text-slate-500">
                          {((Number(debt.minDueRate) || 0.03) * 100).toFixed(0)}%
                        </p>
                      </>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right mono bg-violet-500/5 text-violet-200">
                    {debt.fixedInstallment ? <span className="text-slate-500">—</span> : formatCurrency(projMin)}
                  </td>
                  <td className="py-2.5 text-right bg-violet-500/5">
                    {debt.fixedInstallment ? (
                      <span className="text-slate-500 text-sm">—</span>
                    ) : (
                      <span className="inline-block rounded-lg border border-violet-500/50 bg-violet-500/15 px-2 py-1 mono font-semibold text-violet-200">
                        {formatCurrency(projRounded)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pl-2">
                    <button
                      disabled={debt.remainingBalance <= 0}
                      onClick={() => onMarkPayment(debt.id)}
                      className="whitespace-nowrap rounded-lg border border-rose-400/60 bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Mark Payment
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-600">
                <td className="pt-3 font-semibold text-slate-200" colSpan={2}>
                  TOTAL
                </td>
                <td className="pt-3 pr-3 text-right mono font-semibold text-slate-100">{formatCurrency(totals.minDue)}</td>
                <td className="pt-3 pr-3 text-right mono font-semibold text-slate-100">{formatCurrency(totals.fc)}</td>
                <td className="pt-3 pr-3 text-right mono font-semibold text-slate-100">{formatCurrency(totals.combined)}</td>
                <td className="pt-3 pr-3 text-right">
                  <span className="inline-block rounded-lg border border-cyan-500/50 bg-cyan-500/15 px-2 py-1 mono font-bold text-cyan-200">
                    {formatCurrency(totals.rounded)}
                  </span>
                </td>
                <td className="pt-3"></td>
                <td className="pt-3 pr-3 text-right mono font-semibold text-violet-200 bg-violet-500/5">
                  {formatCurrency(totals.projMin)}
                </td>
                <td className="pt-3 text-right bg-violet-500/5">
                  <span className="inline-block rounded-lg border border-violet-500/50 bg-violet-500/15 px-2 py-1 mono font-bold text-violet-200">
                    {formatCurrency(totals.projRounded)}
                  </span>
                </td>
                <td className="pt-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    )
  }

function ManageDebtsModal({ debts, onSave, onDelete, onClose }) {
  const [draft, setDraft] = useState(EMPTY_DEBT_DRAFT)
  const [editing, setEditing] = useState(null)

  const startEdit = (debt) => {
    setEditing(debt.id)
    setDraft({ ...debt })
  }

  const startAdd = () => {
    setEditing('__new__')
    setDraft({ ...EMPTY_DEBT_DRAFT, id: `debt-${Date.now()}` })
  }

  const handleSave = () => {
    if (!draft.name.trim()) {
      return
    }
    onSave({
      ...draft,
      totalBalance: Number(draft.totalBalance) || 0,
      remainingBalance: Number(draft.remainingBalance) || 0,
      monthlyPayment: Number(draft.monthlyPayment) || 0,
      monthsRemaining: Number(draft.monthsRemaining) || 0,
      interestRate: Number(draft.interestRate) || 0,
      minDue: Number(draft.minDue) || 0,
      financeCharge: Number(draft.financeCharge) || 0,
      minDueRate: Number(draft.minDueRate) || 0.03,
      paymentHistory: draft.paymentHistory || [],
    })
    setDraft(EMPTY_DEBT_DRAFT)
    setEditing(null)
  }

  const field = (label, key, type = 'text') => (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-400">{label}</span>
      <input
        type={type}
        value={draft[key]}
        onChange={(e) => setDraft((p) => ({ ...p, [key]: e.target.value }))}
        className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
      />
    </label>
  )

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-slate-950/80 p-4">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-100">Manage Debts</h3>
          <div className="flex gap-2">
            <button
              onClick={startAdd}
              className="rounded-lg border border-cyan-500/60 bg-cyan-500/20 px-3 py-1.5 text-sm font-medium text-cyan-100 hover:bg-cyan-500/30"
            >
              + Add Debt
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </div>

        {editing && (
          <div className="mb-4 rounded-xl border border-slate-700 bg-slate-800/60 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-200">
              {editing === '__new__' ? 'Add New Debt' : `Edit: ${draft.name}`}
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {field('Debt Name', 'name')}
              {field('Bank / App', 'bank')}
              {field('Total Balance', 'totalBalance', 'number')}
              {field('Remaining Balance', 'remainingBalance', 'number')}
              {field('Monthly Payment', 'monthlyPayment', 'number')}
              {field('Months Remaining', 'monthsRemaining', 'number')}
              {field('Interest Rate (decimal)', 'interestRate', 'number')}
              {field('Min Due', 'minDue', 'number')}
              {field('Finance Charge', 'financeCharge', 'number')}
              {field('Min Due Rate (e.g. 0.03)', 'minDueRate', 'number')}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleSave}
                className="rounded-lg border border-emerald-500/60 bg-emerald-500/20 px-3 py-1.5 text-sm font-medium text-emerald-100 hover:bg-emerald-500/30"
              >
                Save
              </button>
              <button
                onClick={() => { setEditing(null); setDraft(EMPTY_DEBT_DRAFT) }}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase tracking-widest text-slate-400">
                <th className="pb-2 text-left">Name</th>
                <th className="pb-2 text-left">Bank</th>
                <th className="pb-2 text-right">Balance</th>
                <th className="pb-2 text-right">Monthly</th>
                <th className="pb-2 text-right">Min Due</th>
                <th className="pb-2 text-right">FC</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {debts.map((debt) => (
                <tr key={debt.id} className="border-b border-slate-800/80">
                  <td className="py-2 pr-2 text-slate-100">{debt.name}</td>
                  <td className="py-2 pr-2 text-slate-400">{debt.bank}</td>
                  <td className="py-2 pr-2 text-right mono text-slate-200">
                    {formatCurrency(debt.remainingBalance)}
                  </td>
                  <td className="py-2 pr-2 text-right mono text-slate-200">
                    {formatCurrency(debt.monthlyPayment)}
                  </td>
                  <td className="py-2 pr-2 text-right mono text-slate-300">
                    {formatCurrency(debt.minDue || 0)}
                  </td>
                  <td className="py-2 pr-2 text-right mono text-slate-300">
                    {formatCurrency(debt.financeCharge || 0)}
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEdit(debt)}
                        className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onDelete(debt.id)}
                        className="rounded border border-rose-500/50 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/20"
                      >
                        Del
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, subtitle, accent }) {
  return (
    <article className="rounded-2xl border border-slate-700/70 bg-slate-800/80 p-4 shadow-lg shadow-slate-950/30 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-100">{value}</p>
      <p className={`mt-3 text-sm ${accent}`}>{subtitle}</p>
    </article>
  )
}

function StatusBadge({ status }) {
  const map = {
    paid: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
    ongoing: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
    heavy: 'bg-rose-500/20 text-rose-300 border-rose-500/50',
  }
  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-medium uppercase ${map[status]}`}>
      {status}
    </span>
  )
}

// Feature component: Payment Reminders Calendar
function PaymentRemindersCalendar({ debts }) {
  const now = new Date()
  const currentDay = now.getDate()
  const daysUntil = (dueDate) => {
    const days = dueDate - currentDay
    return days < 0 ? days + 30 : days === 0 ? 0 : days
  }
  const getDueStatus = (daysIf) => {
    if (daysIf < 0 || daysIf > 30) return 'overdue'
    if (daysIf === 0) return 'today'
    if (daysIf <= 7) return 'soon'
    if (daysIf <= 15) return 'week'
    return 'month'
  }
  const sorted = [...debts].sort((a, b) => (a.dueDate || 30) - (b.dueDate || 30))
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-800/70 p-4 shadow-xl shadow-slate-950/30">
      <h2 className="text-lg font-semibold text-slate-100">Payment Due Dates</h2>
      <div className="mt-3 grid gap-2">
        {sorted.map((debt) => {
          const days = daysUntil(debt.dueDate || 30)
          const status = getDueStatus(days)
          const statusColor = { today: 'text-rose-200 border-rose-400', soon: 'text-amber-200 border-amber-400', week: 'text-cyan-200 border-cyan-400', month: 'text-emerald-200 border-emerald-400', overdue: 'text-rose-300 border-rose-500' }[status]
          const icon = { today: '🔴', soon: '🟠', week: '🔵', month: '🟢', overdue: '⚠️' }[status]
          return (
            <div key={debt.id} className={`rounded-lg border flex items-center justify-between p-2 text-xs ${statusColor}`}>
              <span>{icon} {debt.name} due {debt.dueDate ? `day ${debt.dueDate}` : 'N/A'}</span>
              <span className="font-semibold">{days === 0 ? 'TODAY' : `${Math.abs(days)}d`}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Feature component: Scenario Comparison (Snowball vs Avalanche vs Cashflow)
function ScenarioComparison({ debts, totalIncome, settings }) {
  const scenarios = {}
  const strategies = ['snowball', 'interest', 'cashflow']
  strategies.forEach((strat) => {
    const timeline = buildBurnDown(debts, strat, debts.reduce((s, d) => s + d.monthlyPayment, 0) + (settings.manualExtra || 0), totalIncome, settings.interestBoost)
    const debtFreeMonth = timeline.find((item) => item.remaining <= 0)?.month.replace('Month ', '') || '120+'
    const totalInterest = timeline.reduce((sum, point) => sum + (point.interest || 0), 0)
    scenarios[strat] = { debtFreeMonth, timeline }
  })
  const [selected, setSelected] = useState('cashflow')
  const timeline = scenarios[selected].timeline
  return (
    <section className="mt-5 rounded-2xl border border-slate-700/60 bg-slate-800/70 p-4 shadow-xl shadow-slate-950/30">
      <h2 className="mb-3 text-xl font-semibold text-slate-100">Payoff Strategies Comparison</h2>
      <div className="mb-4 flex gap-2">
        {strategies.map((strat) => (
          <button key={strat} onClick={() => setSelected(strat)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${selected === strat ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100' : 'border-slate-600 bg-slate-700 text-slate-300'}`}>
            {strat.charAt(0).toUpperCase() + strat.slice(1)}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
          <p className="text-xs text-slate-400">Debt Free Month</p>
          <p className="mono mt-1 text-xl font-bold text-cyan-300">Month {scenarios[selected].debtFreeMonth}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
          <p className="text-xs text-slate-400">Fastest Strategy</p>
          <p className="mono mt-1 text-sm text-emerald-300">{Object.entries(scenarios).sort((a, b) => parseInt(a[1].debtFreeMonth) - parseInt(b[1].debtFreeMonth))[0][0]}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
          <p className="text-xs text-slate-400">Months Saved vs Slowest</p>
          <p className="mono mt-1 text-sm text-amber-300">{Math.max(...Object.values(scenarios).map((s) => parseInt(s.debtFreeMonth))) - parseInt(scenarios[selected].debtFreeMonth)} months</p>
        </div>
      </div>
    </section>
  )
}

// Feature component: Creditor Directory
function CreditorDirectory({ debts }) {
  return (
    <section className="mt-5 rounded-2xl border border-slate-700/60 bg-slate-800/70 p-4 shadow-xl shadow-slate-950/30">
      <h2 className="mb-3 text-lg font-semibold text-slate-100">Creditor Contact Directory</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {debts.filter((d) => d.creditorContacts).map((debt) => (
          <div key={debt.id} className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
            <p className="font-semibold text-slate-100">{debt.name}</p>
            <p className="text-xs text-slate-400">{debt.bank}</p>
            <div className="mt-2 space-y-1 text-xs">
              {debt.creditorContacts.phone && (
                <p>
                  <span className="text-slate-400">📞 </span>
                  <a href={`tel:${debt.creditorContacts.phone}`} className="text-cyan-200 hover:underline">
                    {debt.creditorContacts.phone}
                  </a>
                </p>
              )}
              {debt.creditorContacts.email && (
                <p>
                  <span className="text-slate-400">📧 </span>
                  <a href={`mailto:${debt.creditorContacts.email}`} className="text-cyan-200 hover:underline">
                    {debt.creditorContacts.email}
                  </a>
                </p>
              )}
              {debt.creditorContacts.website && (
                <p>
                  <span className="text-slate-400">🌐 </span>
                  <a href={`https://${debt.creditorContacts.website}`} target="_blank" className="text-cyan-200 hover:underline">
                    {debt.creditorContacts.website}
                  </a>
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// Feature component: Interest Accrual Tracker
function InterestAccrualTracker({ debts }) {
  const totalMonthlyInterest = debts.reduce((sum, d) => sum + (Number(d.financeCharge) || 0), 0)
  const totalAccruedInterest = debts.reduce((sum, d) => sum + ((Number(d.financeCharge) || 0) * (d.monthsRemaining || 1)), 0)
  const savingsPerExtra1000 = 25  // Approximation
  return (
    <div className="mt-5 rounded-2xl border border-slate-700/60 bg-slate-800/70 p-4 shadow-xl shadow-slate-950/30">
      <h2 className="text-lg font-semibold text-slate-100">Interest & Savings Analysis</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-rose-700/40 bg-rose-500/10 p-3">
          <p className="text-xs text-rose-300">Monthly Interest Charge</p>
          <p className="mono mt-2 text-xl font-bold text-rose-200">{formatCurrency(totalMonthlyInterest)}</p>
        </div>
        <div className="rounded-lg border border-amber-700/40 bg-amber-500/10 p-3">
          <p className="text-xs text-amber-300">Total Interest (Remaining Months)</p>
          <p className="mono mt-2 text-xl font-bold text-amber-200">{formatCurrency(totalAccruedInterest)}</p>
        </div>
        <div className="rounded-lg border border-emerald-700/40 bg-emerald-500/10 p-3">
          <p className="text-xs text-emerald-300">Savings per ₱1k Extra/Month</p>
          <p className="mono mt-2 text-xl font-bold text-emerald-200">≈{formatCurrency(savingsPerExtra1000)}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-400">💡 Every ₱1,000 extra payment monthly saves roughly {savingsPerExtra1000} PHP in interest over time.</p>
    </div>
  )
}

// Feature component: Historical Performance Dashboard
function HistoricalDashboard({ debts }) {
  const totalPaid = debts.reduce((sum, d) => sum + d.paymentHistory.reduce((ps, p) => ps + p.amount, 0), 0)
  const totalPayments = debts.reduce((sum, d) => sum + d.paymentHistory.length, 0)
  const avgPaymentSize = totalPayments > 0 ? totalPaid / totalPayments : 0
  const onTrack = debts.filter((d) => d.remainingBalance > 0 && d.monthsRemaining >= 0).length >= debts.filter((d) => d.remainingBalance > 0).length * 0.8
  return (
    <div className="mt-5 rounded-2xl border border-slate-700/60 bg-slate-800/70 p-4 shadow-xl shadow-slate-950/30">
      <h2 className="text-lg font-semibold text-slate-100">Historical Performance</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
          <p className="text-xs text-slate-400">Total Paid</p>
          <p className="mono mt-2 text-xl font-bold text-cyan-300">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
          <p className="text-xs text-slate-400">Payment Count</p>
          <p className="mono mt-2 text-xl font-bold text-slate-100">{totalPayments}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
          <p className="text-xs text-slate-400">Status</p>
          <p className={`mono mt-2 text-lg font-bold ${onTrack ? 'text-emerald-300' : 'text-amber-300'}`}>{onTrack ? '✓ On Track' : '⚠ Check Goals'}</p>
        </div>
      </div>
    </div>
  )
}

// Feature component: Debt Consolidation Simulator
function DebtConsolidationModal({ debts, onClose }) {
  const [selectedIds, setSelectedIds] = useState([])
  const [loanRate, setLoanRate] = useState(0.08)
  const [loanTerm, setLoanTerm] = useState(24)
  
  const selectedDebts = debts.filter((d) => selectedIds.includes(d.id))
  const consolidatedBalance = selectedDebts.reduce((sum, d) => sum + d.remainingBalance, 0)
  const monthlyPayment = consolidatedBalance > 0 ? (consolidatedBalance * loanRate) / 12 / (1 - Math.pow(1 + loanRate / 12, -loanTerm)) : 0
  
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-slate-950/75 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5">
        <h3 className="text-lg font-semibold text-slate-100">Debt Consolidation Simulator</h3>
        <div className="mt-4 space-y-3 text-sm">
          <div>
            <p className="mb-2 text-slate-300">Select debts to consolidate:</p>
            <div className="space-y-2">
              {debts.map((d) => (
                <label key={d.id} className="flex items-center gap-2">
                  <input type="checkbox" checked={selectedIds.includes(d.id)} onChange={(e) => setSelectedIds(e.target.checked ? [...selectedIds, d.id] : selectedIds.filter((id) => id !== d.id))} className="h-4 w-4 rounded" />
                  <span className="text-slate-300">{d.name} ({formatCurrency(d.remainingBalance)})</span>
                </label>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-slate-300">Loan Interest Rate</span>
            <input type="number" min="0" max="1" step="0.01" value={loanRate} onChange={(e) => setLoanRate(Number(e.target.value))} className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100" />
            <p className="mt-1 text-xs text-slate-500">{(loanRate * 100).toFixed(1)}%</p>
          </label>
          <label className="block">
            <span className="mb-1 block text-slate-300">Loan Term (months)</span>
            <input type="number" min="6" max="120" value={loanTerm} onChange={(e) => setLoanTerm(Number(e.target.value))} className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100" />
          </label>
          {consolidatedBalance > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
              <p className="text-xs text-slate-400">Total to Consolidate</p>
              <p className="mono mt-1 font-bold text-cyan-300">{formatCurrency(consolidatedBalance)}</p>
              <p className="mt-2 text-xs text-slate-400">New Monthly Payment</p>
              <p className="mono mt-1 font-bold text-emerald-300">{formatCurrency(monthlyPayment)}</p>
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [debts, setDebts] = useState(seedDebts)
  const [settings, setSettings] = useState(seedSettings)
  const [chatInput, setChatInput] = useState('')
  const [chatHistory, setChatHistory] = useState([
    {
      role: 'assistant',
      content:
        'MCP Assistant online. Ask what to pay next, affordability checks, or debt-free timeline.',
    },
  ])

  const [paymentDraft, setPaymentDraft] = useState({
    debtId: null,
    amount: '',
    note: '',
    date: new Date().toISOString().slice(0, 10),
  })

  const [showManage, setShowManage] = useState(false)
  const [showConsolidationModal, setShowConsolidationModal] = useState(false)
  const [selectedConsolidationDebts, setSelectedConsolidationDebts] = useState([])
  const [consolidationRate, setConsolidationRate] = useState(5.5)
  const [consolidationTerm, setConsolidationTerm] = useState(60)
  const [selectedPaymentStrategy, setSelectedPaymentStrategy] = useState('snowball')
  const [dbStatus, setDbStatus] = useState('checking')
  const saveTimer = useRef(null)

  const normalizeDebts = useCallback((value) => {
    const list = Array.isArray(value) ? value : Array.isArray(value?.debts) ? value.debts : null
    if (!list) {
      return null
    }
    return list.map((item) => ({
      ...item,
      paymentHistory: Array.isArray(item.paymentHistory) ? item.paymentHistory : [],
      minDueRate: Number(item.minDueRate) || 0.03,
    }))
  }, [])

  const applyParsed = useCallback((parsed) => {
    const storedVersion = parsed.seedVersion ?? 0
    const normalizedDebts = normalizeDebts(parsed.debts)

    if (parsed.settings) {
      setSettings((prev) => ({ ...prev, ...parsed.settings }))
    }
    if (parsed.chatHistory && parsed.chatHistory.length > 0) {
      setChatHistory(parsed.chatHistory)
    }

    if (storedVersion < SEED_VERSION) {
      const merged = seedDebts.map((seed) => {
        const saved = (normalizedDebts || []).find((d) => d.id === seed.id)
        if (!saved) return seed
        return {
          ...seed,
          remainingBalance: saved.remainingBalance ?? seed.remainingBalance,
          monthsRemaining: saved.monthsRemaining ?? seed.monthsRemaining,
          minDue: saved.minDue ?? seed.minDue,
          financeCharge: saved.financeCharge ?? seed.financeCharge,
          minDueRate: saved.minDueRate ?? seed.minDueRate,
          paymentHistory: saved.paymentHistory ?? [],
        }
      })
      const seedIds = new Set(seedDebts.map((s) => s.id))
      const userAdded = (normalizedDebts || []).filter((d) => !seedIds.has(d.id))
      setDebts([...merged, ...userAdded])
    } else if (normalizedDebts) {
      setDebts(normalizedDebts)
    }
  }, [normalizeDebts])

  useEffect(() => {
    async function loadData() {
      const online = await checkConnection()
      setDbStatus(online ? 'online' : 'offline')

      if (online) {
        const [remoteDebts, remoteSettings, remoteChatHistory] = await Promise.all([
          dbLoad('debts'),
          dbLoad('settings'),
          dbLoad('chatHistory'),
        ])
        if (remoteDebts || remoteSettings || remoteChatHistory) {
          applyParsed({
            debts: remoteDebts,
            settings: remoteSettings,
            chatHistory: remoteChatHistory,
            seedVersion: SEED_VERSION,
          })
          return
        }
      }

      if (typeof window === 'undefined') {
        return
      }
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        return
      }
      try {
        applyParsed(JSON.parse(raw))
      } catch (error) {
        console.error('Failed to parse local storage', error)
      }
    }

    loadData()
  }, [applyParsed])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        seedVersion: SEED_VERSION,
        debts,
        settings,
        chatHistory,
      }),
    )

    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
    }
    saveTimer.current = setTimeout(async () => {
      if (dbStatus !== 'online') {
        return
      }
      await Promise.all([
        dbSave('debts', debts),
        dbSave('settings', settings),
        dbSave('chatHistory', chatHistory),
      ])
    }, 600)
  }, [debts, settings, chatHistory, dbStatus])

  const totalIncome = Number(settings.biMonthlySalary || 0) * 2
  const fixedPayments = debts
    .filter((debt) => debt.remainingBalance > 0)
    .reduce((sum, debt) => sum + debt.monthlyPayment, 0)
  const monthlyBudget =
    Number(settings.monthlyBudgetOverride) > 0
      ? Number(settings.monthlyBudgetOverride)
      : totalIncome

  const reallocatedFlow = debts
    .filter((debt) => debt.remainingBalance <= 0)
    .reduce((sum, debt) => sum + debt.monthlyPayment, 0)

  const requestedExtra = Math.max(0, Number(settings.manualExtra || 0)) + reallocatedFlow
  const capBySafetyRule = Math.max(0, totalIncome * 0.5 - fixedPayments)
  const capByBudget = Math.max(0, monthlyBudget - fixedPayments)
  const safeExtraAllowed = Math.max(0, Math.min(capBySafetyRule, capByBudget))
  const appliedExtra = Math.min(requestedExtra, safeExtraAllowed)
  const remainingDisposable = totalIncome - fixedPayments - appliedExtra
  const safeRuleBreached = remainingDisposable < totalIncome * 0.5
  const overAllocated = requestedExtra > safeExtraAllowed

  const rankedDebts = useMemo(() => {
    return [...debts]
      .filter((debt) => debt.remainingBalance > 0)
      .sort(
        (a, b) =>
          scoreDebt(b, settings.strategy, totalIncome, settings.interestBoost) -
          scoreDebt(a, settings.strategy, totalIncome, settings.interestBoost),
      )
  }, [debts, settings.strategy, totalIncome, settings.interestBoost])

  const topTarget = rankedDebts[0]

  const timeline = useMemo(() => {
    return buildBurnDown(
      debts,
      settings.strategy,
      fixedPayments + appliedExtra,
      totalIncome,
      settings.interestBoost,
    )
  }, [debts, settings.strategy, fixedPayments, appliedExtra, totalIncome, settings.interestBoost])

  const debtFreeMonth = useMemo(() => {
    const point = timeline.find((item) => item.remaining <= 0)
    if (!point) {
      return '120+'
    }
    return point.month.replace('Month ', '')
  }, [timeline])

  const totalDebt = debts.reduce((sum, debt) => sum + debt.remainingBalance, 0)
  const initialDebt = debts.reduce((sum, debt) => sum + debt.totalBalance, 0)
  const paidPercent = initialDebt > 0 ? ((initialDebt - totalDebt) / initialDebt) * 100 : 100

  const recommendations = [
    topTarget
      ? `Focus on ${topTarget.name} first (${formatCurrency(topTarget.monthlyPayment)} monthly burden).`
      : 'All debts are paid. Redirect cash to savings and emergency fund.',
    overAllocated
      ? `You are over-allocating. Safe extra is ${formatCurrency(safeExtraAllowed)} this month.`
      : `You can add up to ${formatCurrency(safeExtraAllowed)} safely under the 50% rule.`,
    `Estimated debt-free timeline: month ${debtFreeMonth}.`,
  ]

  const updateDebtField = (id, field, value) => {
    setDebts((prev) => prev.map((d) => (d.id === id ? { ...d, [field]: value } : d)))
  }

  const saveDebt = (draft) => {
    setDebts((prev) => {
      const exists = prev.find((d) => d.id === draft.id)
      if (exists) {
        return prev.map((d) => (d.id === draft.id ? draft : d))
      }
      return [...prev, draft]
    })
  }

  const deleteDebt = (id) => {
    setDebts((prev) => prev.filter((d) => d.id !== id))
  }

  const submitPayment = () => {
    if (!paymentDraft.debtId) {
      return
    }
    const paidAmount = Number(paymentDraft.amount)
    if (!paidAmount || paidAmount <= 0) {
      return
    }

    setDebts((prev) =>
      prev.map((debt) => {
        if (debt.id !== paymentDraft.debtId) {
          return debt
        }
        const nextRemaining = Math.max(0, debt.remainingBalance - paidAmount)
        const nextMonths = nextRemaining <= 0 ? 0 : Math.ceil(nextRemaining / debt.monthlyPayment)

        return {
          ...debt,
          remainingBalance: nextRemaining,
          monthsRemaining: nextMonths,
          paymentHistory: [
            {
              id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              date: paymentDraft.date,
              amount: paidAmount,
              note: paymentDraft.note,
            },
            ...(debt.paymentHistory || []),
          ],
        }
      }),
    )

    setPaymentDraft({
      debtId: null,
      amount: '',
      note: '',
      date: new Date().toISOString().slice(0, 10),
    })
  }

  const sendChat = async () => {
    if (!chatInput.trim()) {
      return
    }
    const question = chatInput.trim()

    setChatHistory((prev) => [...prev, { role: 'user', content: question }])
    setChatInput('')

    const context = {
      topTarget,
      safeExtraAllowed,
      fixedPayments,
      appliedExtra,
      debtFreeMonth,
      safeRuleBreached,
      totalIncome,
      remainingDisposable,
    }

    let reply = buildAssistantReply(question, context)

    // Optional hook: attach window.debtTrackerLLM = async ({ question, context }) => string
    if (typeof window !== 'undefined' && typeof window.debtTrackerLLM === 'function') {
      try {
        const external = await window.debtTrackerLLM({ question, context, debts })
        if (typeof external === 'string' && external.trim()) {
          reply = external.trim()
        }
      } catch (error) {
        console.error('External MCP hook failed', error)
      }
    }

    setChatHistory((prev) => [...prev, { role: 'assistant', content: reply }])
  }

  return (
    <div className="mx-auto min-h-screen max-w-7xl p-4 md:p-6">
      <header className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-700/60 bg-slate-900/70 p-4 shadow-xl shadow-slate-950/40 backdrop-blur md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 md:text-3xl">Debt Tracker</h1>
          <p className="mt-1 text-sm text-slate-400">
            Cashflow snowball control panel with salary safety guardrails.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-slate-300">
            {dbStatus === 'checking' && '⏳ connecting...'}
            {dbStatus === 'online' && '● PocketBase'}
            {dbStatus === 'offline' && '⚠ localStorage only'}
          </span>
          <button
            onClick={() => setShowManage(true)}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
          >
            Manage Debts ▾
          </button>
          <select
            value={settings.strategy}
            onChange={(event) =>
              setSettings((prev) => ({ ...prev, strategy: event.target.value }))
            }
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
          >
            <option value="cashflow">Cashflow Priority</option>
            <option value="snowball">Snowball</option>
            <option value="interest">Interest First</option>
          </select>
          <label className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={settings.interestBoost}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, interestBoost: event.target.checked }))
              }
              className="h-4 w-4 accent-cyan-400"
            />
            Interest boost
          </label>
        </div>
      </header>

      <section className="mb-5 grid gap-3 md:grid-cols-5">
        <StatCard
          title="Total Debt"
          value={formatCurrency(totalDebt)}
          subtitle={`${debts.filter((debt) => debt.remainingBalance > 0).length} active debts`}
          accent="text-cyan-300"
        />
        <StatCard
          title="Total Monthly"
          value={formatCurrency(fixedPayments)}
          subtitle="Fixed obligations"
          accent="text-slate-300"
        />
        <StatCard
          title="Debt Paid"
          value={`${paidPercent.toFixed(1)}%`}
          subtitle={`${formatCurrency(initialDebt - totalDebt)} cleared`}
          accent="text-emerald-300"
        />
        <StatCard
          title="Current Target"
          value={topTarget ? topTarget.name : 'None'}
          subtitle={topTarget ? topTarget.bank : 'No active debt'}
          accent="text-rose-300"
        />
        <StatCard
          title="Remaining Safe Budget"
          value={formatCurrency(safeExtraAllowed)}
          subtitle={safeRuleBreached ? 'Unsafe plan' : 'Within safety guardrail'}
          accent={safeRuleBreached ? 'text-rose-300' : 'text-emerald-300'}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-2xl border border-slate-700/60 bg-slate-800/70 p-4 shadow-xl shadow-slate-950/30">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-100">Debt Overview</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Sorted by {settings.strategy}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="pb-2">Debt</th>
                  <th className="pb-2">Bank/App</th>
                  <th className="pb-2">Remaining</th>
                  <th className="pb-2">Monthly</th>
                  <th className="pb-2">Months Left</th>
                  <th className="pb-2">Progress</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...debts]
                  .sort((a, b) => {
                    const aFixed = a.fixedInstallment ? 1 : 0
                    const bFixed = b.fixedInstallment ? 1 : 0
                    if (aFixed !== bFixed) return aFixed - bFixed
                    return b.remainingBalance - a.remainingBalance
                  })
                  .map((debt) => {
                    const progress =
                      debt.totalBalance > 0
                        ? ((debt.totalBalance - debt.remainingBalance) / debt.totalBalance) * 100
                        : 100
                    const status = getStatus(debt)
                    const isTarget = topTarget?.id === debt.id

                    return (
                      <>
                        <tr key={debt.id} className="border-b border-slate-800/80 align-top">
                          <td className="py-3 pr-2">
                            <p className="font-semibold text-slate-100">{debt.name}</p>
                            {isTarget && (
                              <span className="mt-1 inline-block rounded-full bg-rose-500/30 px-2 py-0.5 text-xs text-rose-200">
                                target
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-2 text-slate-300">{debt.bank}</td>
                          <td className="py-3 pr-2 mono text-slate-200">
                            {formatCurrency(debt.remainingBalance)}
                          </td>
                          <td className="py-3 pr-2 mono text-slate-200">
                            {formatCurrency(debt.monthlyPayment)}
                          </td>
                          <td className="py-3 pr-2 text-slate-200">{debt.monthsRemaining}</td>
                          <td className="py-3 pr-2 text-slate-200">{progress.toFixed(1)}%</td>
                          <td className="py-3 pr-2">
                            <StatusBadge status={status} />
                          </td>
                        </tr>
                        {(debt.paymentHistory || []).slice(0, 3).map((payment) => (
                          <tr key={payment.id} className="text-xs text-slate-400">
                            <td className="pb-2 pl-2">{payment.date}</td>
                            <td className="pb-2" colSpan={2}>
                              {payment.note || 'Payment logged'}
                            </td>
                            <td className="pb-2 mono" colSpan={2}>
                              {formatCurrency(payment.amount)}
                            </td>
                            <td className="pb-2" colSpan={3}>
                              history
                            </td>
                          </tr>
                        ))}
                      </>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-700/60 bg-slate-800/70 p-4 shadow-xl shadow-slate-950/30">
            <h2 className="text-xl font-semibold text-slate-100">Monthly Budget Simulator</h2>

            <div className="mt-3 space-y-3 text-sm">
              <label className="block">
                <span className="mb-1 block text-slate-300">Bi-monthly salary</span>
                <input
                  type="number"
                  value={settings.biMonthlySalary}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, biMonthlySalary: Number(event.target.value) }))
                  }
                  className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-slate-300">Monthly budget override (optional)</span>
                <input
                  type="number"
                  value={settings.monthlyBudgetOverride}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, monthlyBudgetOverride: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-slate-300">Manual extra payment</span>
                <input
                  type="number"
                  value={settings.manualExtra}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, manualExtra: Number(event.target.value) }))
                  }
                  className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100"
                />
              </label>
            </div>

            <div className="mt-4 space-y-2 rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm">
              <p className="flex items-center justify-between">
                <span className="text-slate-400">Total income</span>
                <span className="mono text-slate-100">{formatCurrency(totalIncome)}</span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-slate-400">Fixed payments</span>
                <span className="mono text-slate-100">{formatCurrency(fixedPayments)}</span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-slate-400">Extra allowed (safe)</span>
                <span className="mono text-emerald-300">{formatCurrency(safeExtraAllowed)}</span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-slate-400">Applied extra</span>
                <span className="mono text-cyan-300">{formatCurrency(appliedExtra)}</span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-slate-400">Remaining disposable</span>
                <span className="mono text-slate-100">{formatCurrency(remainingDisposable)}</span>
              </p>
            </div>

            {overAllocated && (
              <p className="mt-3 rounded-lg border border-amber-500/60 bg-amber-500/20 p-2 text-sm text-amber-200">
                Payment exceeds safe threshold. Extra was auto-reduced to protect your 50% salary buffer.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-700/60 bg-slate-800/70 p-4 shadow-xl shadow-slate-950/30">
            <h2 className="text-xl font-semibold text-slate-100">MCP Assistant</h2>

            <ul className="mt-3 space-y-2 text-sm text-slate-200">
              {recommendations.map((item) => (
                <li key={item} className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-3 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-sm">
              {chatHistory.map((entry, idx) => (
                <div
                  key={`${entry.role}-${idx}`}
                  className={`rounded-lg p-2 ${
                    entry.role === 'assistant'
                      ? 'border border-cyan-700/40 bg-cyan-500/10 text-cyan-100'
                      : 'border border-slate-600 bg-slate-700/50 text-slate-100'
                  }`}
                >
                  <p className="text-[11px] uppercase tracking-[0.15em] opacity-70">{entry.role}</p>
                  <p>{entry.content}</p>
                </div>
              ))}
            </div>

            <div className="mt-2 flex gap-2">
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    sendChat()
                  }
                }}
                placeholder="What should I pay next?"
                className="flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
              <button
                onClick={sendChat}
                className="rounded-lg border border-cyan-400/60 bg-cyan-500/20 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/30"
              >
                Ask
              </button>
            </div>
          </div>
        </aside>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-700/60 bg-slate-800/70 p-4 shadow-xl shadow-slate-950/30">
        <h2 className="mb-3 text-xl font-semibold text-slate-100">Debt Burn-down Timeline</h2>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeline}>
              <defs>
                <linearGradient id="debtGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#334155" strokeDasharray="4 4" />
              <XAxis dataKey="month" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                }}
                formatter={(value) => formatCurrency(Number(value))}
              />
              <Area
                type="monotone"
                dataKey="remaining"
                stroke="#7dd3fc"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#debtGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {paymentDraft.debtId && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-slate-950/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-4">
            <h3 className="text-lg font-semibold text-slate-100">Log Payment</h3>
            <p className="text-sm text-slate-400">
              {debts.find((debt) => debt.id === paymentDraft.debtId)?.name}
            </p>

            <div className="mt-3 space-y-3 text-sm">
              <label className="block">
                <span className="mb-1 block text-slate-300">Date</span>
                <input
                  type="date"
                  value={paymentDraft.date}
                  onChange={(event) =>
                    setPaymentDraft((prev) => ({ ...prev, date: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-slate-300">Amount paid</span>
                <input
                  type="number"
                  value={paymentDraft.amount}
                  onChange={(event) =>
                    setPaymentDraft((prev) => ({ ...prev, amount: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-slate-300">Note (optional)</span>
                <input
                  type="text"
                  value={paymentDraft.note}
                  onChange={(event) =>
                    setPaymentDraft((prev) => ({ ...prev, note: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100"
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() =>
                  setPaymentDraft({
                    debtId: null,
                    amount: '',
                    note: '',
                    date: new Date().toISOString().slice(0, 10),
                  })
                }
                className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={submitPayment}
                className="rounded-lg border border-emerald-500/70 bg-emerald-500/20 px-3 py-2 text-sm font-medium text-emerald-100"
              >
                Save Payment
              </button>
            </div>
          </div>
        </div>
      )}

      <InterestAccrualTracker debts={debts} />

      <PaymentRemindersCalendar debts={debts} />

      <ScenarioComparison
        debts={debts}
        selectedStrategy={selectedPaymentStrategy}
        onStrategyChange={setSelectedPaymentStrategy}
      />

      <HistoricalDashboard debts={debts} />

      <CreditorDirectory debts={debts} />

      <MinPaymentPlanner
        debts={debts}
        onUpdateDebt={updateDebtField}
        onMarkPayment={(id) => setPaymentDraft((prev) => ({ ...prev, debtId: id, amount: '' }))}
      />

      <div className="mt-5 flex justify-center">
        <button
          onClick={() => setShowConsolidationModal(true)}
          className="rounded-lg border border-indigo-500/70 bg-indigo-500/20 px-6 py-3 font-medium text-indigo-100 transition hover:bg-indigo-500/30"
        >
          💰 Consolidation Simulator
        </button>
      </div>

      {showManage && (
        <ManageDebtsModal
          debts={debts}
          onSave={saveDebt}
          onDelete={deleteDebt}
          onClose={() => setShowManage(false)}
        />
      )}

      {showConsolidationModal && (
        <DebtConsolidationModal
          debts={debts}
          selectedDebts={selectedConsolidationDebts}
          onSelectDebt={(id) =>
            setSelectedConsolidationDebts((prev) =>
              prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
            )
          }
          consolidationRate={consolidationRate}
          onRateChange={setConsolidationRate}
          consolidationTerm={consolidationTerm}
          onTermChange={setConsolidationTerm}
          onClose={() => {
            setShowConsolidationModal(false)
            setSelectedConsolidationDebts([])
          }}
        />
      )}
    </div>
  )
}

export default App
