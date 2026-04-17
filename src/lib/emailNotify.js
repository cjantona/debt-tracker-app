import emailjs from '@emailjs/browser'
import { rankDebts, groupFingerprint } from './priority.js'
import { supabase } from './supabase.js'

// ── Supabase state sync (user-scoped via session) ─────────────────────────────
async function sbGetNotifState() {
  if (!supabase) return null
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) return null
  try {
    const { data } = await supabase
      .from('kv_store')
      .select('data')
      .eq('user_id', userId)
      .eq('key', 'email-notif-state')
      .limit(1)
      .single()
    return data?.data ?? null
  } catch { return null }
}

async function sbSetNotifState(state) {
  if (!supabase) return
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) return
  try {
    await supabase.from('kv_store').upsert(
      { user_id: userId, key: 'email-notif-state', data: state },
      { onConflict: 'user_id,key' },
    )
  } catch { /* ignore */ }
}

// ── Config ────────────────────────────────────────────────────────────────────
// Set these in .env.local (and as GitHub Actions secrets for deployment)
const SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID  || ''
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || ''
const PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY  || ''

const NOTIF_STORAGE_KEY = 'debt-tracker:email-notifs'

// ── Helpers ───────────────────────────────────────────────────────────────────
export function isEmailJsConfigured() {
  return Boolean(SERVICE_ID && TEMPLATE_ID && PUBLIC_KEY)
}

function getNextDueDate(dayOfMonth) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), dayOfMonth)
  if (thisMonth >= today) return thisMonth
  return new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth)
}

function formatDateLong(date) {
  return date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatPHP(amount) {
  return `₱${Number(amount || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// ── Notification state stored in localStorage ─────────────────────────────────
export function loadEmailNotifState() {
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY)
    return raw ? JSON.parse(raw) : { sent: {}, lastEmailSent: null }
  } catch {
    return { sent: {}, lastEmailSent: null }
  }
}

function saveEmailNotifState(state) {
  try {
    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore storage errors
  }
}

async function loadEmailNotifStateRemote() {
  const remote = await sbGetNotifState()
  if (remote) {
    // Merge remote into localStorage so offline reads stay fresh
    try { localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(remote)) } catch { /* ignore */ }
    return remote
  }
  return loadEmailNotifState()
}

async function saveEmailNotifStateRemote(state) {
  saveEmailNotifState(state)   // always write localStorage immediately
  await sbSetNotifState(state) // best-effort sync to Supabase
}

// Reset sent state when due date changes (so user gets updated notification)
export function clearSentForDate(dateStr) {
  const state = loadEmailNotifState()
  Object.keys(state.sent).forEach((k) => {
    if (k.startsWith(dateStr)) delete state.sent[k]
  })
  saveEmailNotifState(state)
}

// ── Notification windows ──────────────────────────────────────────────────────
const WINDOWS = [
  { days: 1, label: '1day', subject: '🔴 Urgent: Payments Due Tomorrow' },
  { days: 3, label: '3day', subject: '⚠️ Upcoming Debt Due in 3 Days' },
  { days: 7, label: '7day', subject: '🟡 Payments Due This Week' },
]

// ── Main function ─────────────────────────────────────────────────────────────
// debts        - full debts array from app state
// userEmail    - recipient email address
// priorityName - name of top-priority debt (from rankedDebts[0].name)
// returns      - { sent: bool, results: [], lastEmailSent: string|null, reason?: string }
export async function checkAndSendEmailNotifications(debts, userEmail, priorityName) {
  if (!isEmailJsConfigured()) return { sent: false, reason: 'EmailJS not configured' }
  if (!userEmail) return { sent: false, reason: 'No email address' }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dayMs = 24 * 60 * 60 * 1000

  // Only active (unpaid) debts
  const activeDebts = debts.filter((d) => (d.remainingBalance ?? 0) > 0 && d.dueDate)

  // Group by next-due YYYY-MM-DD
  const byDueDate = {}
  for (const debt of activeDebts) {
    const nextDue = getNextDueDate(debt.dueDate)
    const dateStr = nextDue.toISOString().slice(0, 10)
    if (!byDueDate[dateStr]) byDueDate[dateStr] = { date: nextDue, debts: [] }
    byDueDate[dateStr].debts.push(debt)
  }

  const state = await loadEmailNotifStateRemote()
  const results = []

  for (const [dateStr, group] of Object.entries(byDueDate)) {
    const daysLeft = Math.round((group.date.getTime() - today.getTime()) / dayMs)

    for (const win of WINDOWS) {
      if (daysLeft !== win.days) continue

      // Fingerprint = dateStr + window + sorted debt IDs/amounts
      // Changes if any debt amount changes → triggers a fresh notification
      const fingerprint = groupFingerprint(group.debts, `${dateStr}-${win.label}`)
      const prev = state.sent[`${dateStr}-${win.label}`]
      if (prev?.fingerprint === fingerprint) continue // identical group, already sent

      // Build grouped debt list (plain text + HTML)
      const totalDue = group.debts.reduce(
        (sum, d) => sum + (d.minimumPayment || d.monthlyPayment || 0),
        0,
      )
      const debtListText = group.debts
        .map((d) => `• ${d.name} – ${formatPHP(d.minimumPayment || d.monthlyPayment || 0)}`)
        .join('\n')
      const debtListHtml = group.debts
        .map(
          (d) =>
            `<tr><td style="padding:4px 12px 4px 0">${d.name}</td><td style="padding:4px 0"><strong>${formatPHP(d.minimumPayment || d.monthlyPayment || 0)}</strong></td></tr>`,
        )
        .join('')

      const templateParams = {
        to_email:      userEmail,
        subject:       win.subject,
        due_date:      formatDateLong(group.date),
        days_left:     win.days,
        debt_count:    group.debts.length,
        total_due:     formatPHP(totalDue),
        debt_list:     debtListText,
        debt_list_html: debtListHtml,
        priority_debt: priorityName || rankDebts(group.debts)[0]?.name || group.debts[0]?.name || '',
      }

      try {
        await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY)
        state.sent[`${dateStr}-${win.label}`] = {
          sentAt: new Date().toISOString(),
          fingerprint,
          debtIds: group.debts.map((d) => d.id),
        }
        state.lastEmailSent = new Date().toISOString()
        await saveEmailNotifStateRemote(state)
        results.push({ dateStr, window: win.label, daysLeft: win.days, success: true })
      } catch (err) {
        results.push({ dateStr, window: win.label, success: false, error: String(err) })
      }
    }
  }

  return { sent: results.length > 0, results, lastEmailSent: state.lastEmailSent }
}
