import { supabase } from './supabase'

// ── PocketBase (local) ──────────────────────────────────────────────────────
const PB_URL = import.meta.env.VITE_PB_URL || 'http://127.0.0.1:8090'
const COLLECTION = 'kv_store'

async function pbRequest(path, options = {}) {
  const { signal, ...rest } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  try {
    const res = await fetch(`${PB_URL}/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: signal ?? controller.signal,
      ...rest,
    })
    clearTimeout(timer)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`PocketBase ${res.status}: ${text}`)
    }
    return await res.json()
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

async function pbGetRecord(key) {
  try {
    const result = await pbRequest(
      `/collections/${COLLECTION}/records?filter=(key='${encodeURIComponent(key)}')&perPage=1`,
    )
    return result.items?.[0] ?? null
  } catch {
    return null
  }
}

async function pbCheckConnection() {
  try {
    await pbRequest('/health', {})
    return true
  } catch {
    return false
  }
}

async function pbLoad(key) {
  const record = await pbGetRecord(key)
  return record?.data ?? null
}

async function pbSave(key, data) {
  const existing = await pbGetRecord(key)
  if (existing) {
    await pbRequest(`/collections/${COLLECTION}/records/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data }),
    })
  } else {
    await pbRequest(`/collections/${COLLECTION}/records`, {
      method: 'POST',
      body: JSON.stringify({ key, data }),
    })
  }
}

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function getUserId() {
  if (!supabase) return null
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id ?? null
}

async function sbCheckConnection() {
  if (!supabase || !import.meta.env.VITE_SUPABASE_URL) return false
  try {
    const userId = await getUserId()
    if (!userId) return false
    // Try debts table (Phase 2 schema), fall back to kv_store (Phase 1)
    const { error } = await supabase.from('debts').select('id').limit(1)
    if (!error) return true
    const { error: e2 } = await supabase.from('kv_store').select('key').limit(1)
    return !e2
  } catch {
    return false
  }
}

// ── Row ↔ app object mappers ──────────────────────────────────────────────────
function rowToDebt(row) {
  return {
    id: row.id,
    name: row.name,
    bank: row.bank ?? '',
    totalBalance: Number(row.total_balance ?? 0),
    remainingBalance: Number(row.balance ?? 0),
    monthlyPayment: Number(row.monthly_payment ?? 0),
    monthsRemaining: Number(row.months_remaining ?? 0),
    interestRate: Number(row.interest_rate ?? 0),
    minDue: Number(row.min_due ?? 0),
    financeCharge: Number(row.finance_charge ?? 0),
    minDueRate: Number(row.min_due_rate ?? 0.03),
    dueDate: row.due_day ?? null,
    fixedInstallment: row.fixed_installment ?? false,
    creditorContacts: row.creditor_contacts ?? null,
    actualPaid: Number(row.actual_paid ?? 0),
    paymentHistory: Array.isArray(row.payment_history) ? row.payment_history : [],
    status: row.status ?? 'ongoing',
  }
}

function debtToRow(debt, userId) {
  const remaining = Number(debt.remainingBalance ?? 0)
  const monthly = Number(debt.monthlyPayment ?? 0)
  const months = Number(debt.monthsRemaining ?? 0)
  return {
    id: debt.id,
    user_id: userId,
    name: debt.name,
    bank: debt.bank ?? '',
    total_balance: Number(debt.totalBalance ?? 0),
    balance: remaining,
    monthly_payment: monthly,
    months_remaining: months,
    interest_rate: Number(debt.interestRate ?? 0),
    min_due: Number(debt.minDue ?? 0),
    finance_charge: Number(debt.financeCharge ?? 0),
    min_due_rate: Number(debt.minDueRate ?? 0.03),
    due_day: debt.dueDate ? Number(debt.dueDate) : null,
    status: remaining <= 0 ? 'paid' : (monthly >= 6000 || months >= 14 ? 'heavy' : 'ongoing'),
    fixed_installment: debt.fixedInstallment ?? false,
    creditor_contacts: debt.creditorContacts ?? null,
    actual_paid: Number(debt.actualPaid ?? 0),
    payment_history: debt.paymentHistory ?? [],
    updated_at: new Date().toISOString(),
  }
}

function rowToSettings(row) {
  return {
    biMonthlySalary: Number(row.bi_monthly_salary ?? 0),
    monthlyBudgetOverride: row.monthly_budget_override ?? '',
    manualExtra: Number(row.manual_extra ?? 0),
    strategy: row.strategy ?? 'cashflow',
    interestBoost: row.interest_boost ?? true,
    projectedIncome: Array.isArray(row.projected_income) ? row.projected_income : [],
    userEmail: row.email ?? '',
    emailNotifEnabled: row.notification_enabled ?? false,
  }
}

function settingsToRow(settings, userId) {
  return {
    user_id: userId,
    bi_monthly_salary: Number(settings.biMonthlySalary ?? 0),
    monthly_budget_override: settings.monthlyBudgetOverride
      ? Number(settings.monthlyBudgetOverride)
      : null,
    manual_extra: Number(settings.manualExtra ?? 0),
    strategy: settings.strategy ?? 'cashflow',
    interest_boost: settings.interestBoost ?? true,
    projected_income: settings.projectedIncome ?? [],
    email: settings.userEmail ?? '',
    notification_enabled: settings.emailNotifEnabled ?? false,
    updated_at: new Date().toISOString(),
  }
}

// ── Normalized table operations ───────────────────────────────────────────────
async function sbLoadDebtsNormalized(userId) {
  const { data, error } = await supabase
    .from('debts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data?.length ? data.map(rowToDebt) : null
}

async function sbSaveDebtsNormalized(debts, userId) {
  if (!debts?.length) return
  const rows = debts.map((d) => debtToRow(d, userId))
  const { error } = await supabase.from('debts').upsert(rows, { onConflict: 'id' })
  if (error) throw error
}

async function sbDeleteDebtNormalized(id, userId) {
  const { error } = await supabase
    .from('debts')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
}

async function sbLoadSettingsNormalized(userId) {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', userId)
    .single()
  if (error?.code === 'PGRST116') return null
  if (error) throw error
  return data ? rowToSettings(data) : null
}

async function sbSaveSettingsNormalized(settings, userId) {
  const { error } = await supabase
    .from('settings')
    .upsert(settingsToRow(settings, userId), { onConflict: 'user_id' })
  if (error) throw error
}

// ── One-time migration: kv_store → normalized tables ─────────────────────────
// Idempotent: checks if debts table already has data before migrating.
async function sbMigrateFromKvStore(userId) {
  try {
    const { data: kvRows } = await supabase
      .from('kv_store')
      .select('key, data')
      .eq('user_id', userId)
      .in('key', ['debts', 'settings'])
    if (!kvRows?.length) return false

    const kvDebts = kvRows.find((r) => r.key === 'debts')?.data
    const kvSettings = kvRows.find((r) => r.key === 'settings')?.data

    if (kvDebts && Array.isArray(kvDebts) && kvDebts.length > 0) {
      await sbSaveDebtsNormalized(kvDebts, userId)
    }
    if (kvSettings && typeof kvSettings === 'object') {
      await sbSaveSettingsNormalized(kvSettings, userId)
    }
    return !!(kvDebts || kvSettings)
  } catch {
    return false
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function checkConnection() {
  if (await pbCheckConnection()) return 'pocketbase'
  if (await sbCheckConnection()) return 'supabase'
  return 'offline'
}

// Load debts from normalized table (auto-migrates from kv_store on first use)
export async function loadDebts() {
  if (!supabase) return null
  try {
    const userId = await getUserId()
    if (!userId) return null

    let debts = await sbLoadDebtsNormalized(userId)

    if (!debts) {
      // Normalized table is empty — try migrating from kv_store
      const migrated = await sbMigrateFromKvStore(userId)
      if (migrated) debts = await sbLoadDebtsNormalized(userId)
    }

    return debts
  } catch (err) {
    console.warn('loadDebts failed:', err.message)
    return null
  }
}

// Save (upsert) all debts to normalized table
export async function saveDebts(debts) {
  if (!supabase) throw new Error('Supabase not configured')
  const userId = await getUserId()
  if (!userId) throw new Error('Not authenticated')
  await sbSaveDebtsNormalized(debts, userId)
}

// Delete a single debt from normalized table
export async function deleteDebtFromDB(id) {
  if (!supabase) return
  const userId = await getUserId()
  if (!userId) return
  await sbDeleteDebtNormalized(id, userId).catch((err) =>
    console.warn('deleteDebtFromDB failed:', err.message),
  )
}

// Load settings from normalized table (falls back to kv_store)
export async function loadSettings() {
  if (!supabase) return null
  try {
    const userId = await getUserId()
    if (!userId) return null

    const settings = await sbLoadSettingsNormalized(userId)
    if (settings) return settings

    // Fall back to kv_store
    const { data } = await supabase
      .from('kv_store')
      .select('data')
      .eq('user_id', userId)
      .eq('key', 'settings')
      .single()
      .catch(() => ({ data: null }))
    return data?.data ?? null
  } catch (err) {
    console.warn('loadSettings failed:', err.message)
    return null
  }
}

// Save settings to normalized table
export async function saveSettings(settings) {
  if (!supabase) throw new Error('Supabase not configured')
  const userId = await getUserId()
  if (!userId) throw new Error('Not authenticated')
  await sbSaveSettingsNormalized(settings, userId)
}

// Legacy key-value API (PocketBase only — Supabase now uses normalized tables)
export async function dbLoad(key, backend) {
  try {
    if (backend === 'pocketbase') return await pbLoad(key)
  } catch (err) {
    console.warn(`dbLoad(${backend}) failed:`, err.message)
  }
  return null
}

export async function dbSave(key, data, backend) {
  try {
    if (backend === 'pocketbase') {
      await pbSave(key, data)
      return true
    }
  } catch (err) {
    console.warn(`dbSave(${backend}) failed:`, err.message)
  }
  return false
}

