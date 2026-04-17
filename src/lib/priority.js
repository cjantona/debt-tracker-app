// Shared priority scoring — used by both App.jsx and the Supabase edge function
// Keep in sync with App.jsx scoreDebt()

/**
 * @param {object} debt
 * @param {'cashflow'|'snowball'|'interest'} strategy
 * @param {number} income   - total monthly income
 * @param {boolean} interestBoost
 * @returns {number}
 */
export function scoreDebt(debt, strategy = 'cashflow', income = 0, interestBoost = true) {
  if ((debt.remainingBalance ?? 0) <= 0) return -1
  if (strategy === 'snowball') return 100000 - (debt.remainingBalance ?? 0)
  if (strategy === 'interest') return (debt.interestRate ?? 0) * 1000 + (debt.monthlyPayment ?? 0)
  const burden = (debt.monthlyPayment ?? 0) / Math.max(1, income)
  const interestScore = interestBoost ? (debt.interestRate ?? 0) * 100 : 0
  return (debt.monthlyPayment ?? 0) * 3 + (debt.monthsRemaining ?? 0) * 9 + burden * 500 + interestScore
}

/**
 * Returns debts sorted by priority (highest first), active only.
 * @param {object[]} debts
 * @param {object} settings  - { strategy, interestBoost }
 * @param {number} income
 * @returns {object[]}
 */
export function rankDebts(debts, settings = {}, income = 0) {
  const { strategy = 'cashflow', interestBoost = true } = settings
  return [...debts]
    .filter((d) => (d.remainingBalance ?? 0) > 0)
    .sort(
      (a, b) =>
        scoreDebt(b, strategy, income, interestBoost) -
        scoreDebt(a, strategy, income, interestBoost),
    )
}

/**
 * Returns a stable string fingerprint for a group of debts at a given due date.
 * Used for deduplication: if any debt name, ID or minimum amount changes,
 * the fingerprint changes and a new notification will be sent.
 * @param {object[]} debts
 * @param {string} dateStr  - YYYY-MM-DD
 * @returns {string}
 */
export function groupFingerprint(debts, dateStr) {
  const parts = [...debts]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((d) => `${d.id}:${d.minimumPayment ?? d.monthlyPayment ?? 0}`)
    .join('|')
  return `${dateStr}::${parts}`
}
