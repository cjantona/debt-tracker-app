// Supabase Edge Function: email-reminders
// Scheduled daily at 8:00 AM Philippine time (UTC+8 = 00:00 UTC)
// Deploy: supabase functions deploy email-reminders --no-verify-jwt
// Schedule via pg_cron (see supabase/cron-setup.sql)

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

const EMAILJS_SERVICE_ID  = Deno.env.get('EMAILJS_SERVICE_ID')  ?? ''
const EMAILJS_TEMPLATE_ID = Deno.env.get('EMAILJS_TEMPLATE_ID') ?? ''
const EMAILJS_PUBLIC_KEY  = Deno.env.get('EMAILJS_PUBLIC_KEY')  ?? ''
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')         ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const KV_TABLE = 'kv_store'

// ── Supabase helpers (service role — bypasses RLS) ─────────────────────────────
function sbHeaders() {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }
}

/** Get all distinct user_ids that have a 'settings' row with emailNotifEnabled=true */
async function getActiveUserIds(): Promise<string[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${KV_TABLE}?key=eq.settings&select=user_id,data`,
    { headers: sbHeaders() },
  )
  if (!res.ok) return []
  const rows: { user_id: string; data: Record<string, unknown> }[] = await res.json()
  return rows
    .filter((r) => r.data?.emailNotifEnabled && r.data?.userEmail)
    .map((r) => r.user_id)
}

async function sbGetForUser(userId: string, key: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${KV_TABLE}?user_id=eq.${userId}&key=eq.${encodeURIComponent(key)}&select=data&limit=1`,
    { headers: sbHeaders() },
  )
  if (!res.ok) return null
  const rows = await res.json()
  return rows[0]?.data ?? null
}

async function sbSetForUser(userId: string, key: string, data: unknown) {
  await fetch(`${SUPABASE_URL}/rest/v1/${KV_TABLE}`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: userId, key, data }),
  })
}

// ── Date helpers ─────────────────────────────────────────────────────────────
function getNextDueDate(dayOfMonth: number): Date {
  const now = new Date()
  const todayPH = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
  todayPH.setHours(0, 0, 0, 0)
  const thisMonth = new Date(todayPH.getFullYear(), todayPH.getMonth(), dayOfMonth)
  return thisMonth >= todayPH ? thisMonth : new Date(todayPH.getFullYear(), todayPH.getMonth() + 1, dayOfMonth)
}

function formatDateLong(d: Date): string {
  return d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatPHP(amount: number): string {
  return `₱${Number(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Priority scoring — MUST stay in sync with src/lib/priority.js ─────────────
type Debt = Record<string, unknown>

function scoreDebt(
  debt: Debt,
  strategy: string = 'cashflow',
  income: number = 0,
  interestBoost: boolean = true,
): number {
  const balance = Number(debt.remainingBalance ?? 0)
  if (balance <= 0) return -1
  if (strategy === 'snowball') return 100000 - balance
  const rate    = Number(debt.interestRate    ?? 0)
  const monthly = Number(debt.monthlyPayment  ?? 0)
  const months  = Number(debt.monthsRemaining ?? 0)
  if (strategy === 'interest') return rate * 1000 + monthly
  const burden        = monthly / Math.max(1, income)
  const interestScore = interestBoost ? rate * 100 : 0
  return monthly * 3 + months * 9 + burden * 500 + interestScore
}

function rankDebts(debts: Debt[], strategy: string, income: number, interestBoost: boolean): Debt[] {
  return [...debts]
    .filter((d) => Number(d.remainingBalance ?? 0) > 0)
    .sort((a, b) => scoreDebt(b, strategy, income, interestBoost) - scoreDebt(a, strategy, income, interestBoost))
}

// ── Fingerprint-based dedup — MUST stay in sync with src/lib/priority.js ──────
function groupFingerprint(debts: Debt[], prefix: string): string {
  const parts = [...debts]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((d) => `${d.id}:${Number(d.minimumPayment ?? d.monthlyPayment ?? 0)}`)
    .join('|')
  return `${prefix}::${parts}`
}

// ── Notification windows ──────────────────────────────────────────────────────
const WINDOWS = [
  { days: 1, label: '1day', subject: '🔴 Urgent: Payments Due Tomorrow' },
  { days: 3, label: '3day', subject: '⚠️ Upcoming Debt Due in 3 Days' },
  { days: 7, label: '7day', subject: '🟡 Payments Due This Week' },
]

// ── EmailJS send ──────────────────────────────────────────────────────────────
async function sendEmail(params: Record<string, unknown>) {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id:      EMAILJS_SERVICE_ID,
      template_id:     EMAILJS_TEMPLATE_ID,
      user_id:         EMAILJS_PUBLIC_KEY,
      template_params: params,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`EmailJS ${res.status}: ${text}`)
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async () => {
  const globalLog: string[] = []

  try {
    if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
      return new Response(JSON.stringify({ error: 'EmailJS env vars not set' }), { status: 500 })
    }

    // Find all users with email notifications enabled
    const userIds = await getActiveUserIds()
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ skipped: 'No users with email notifications enabled' }), { status: 200 })
    }

    const now = new Date()
    const todayPH = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
    todayPH.setHours(0, 0, 0, 0)
    const dayMs = 24 * 60 * 60 * 1000

    // Process each user independently
    for (const userId of userIds) {
      const log: string[] = []

      const [debtsRaw, settings, notifStateRaw] = await Promise.all([
        sbGetForUser(userId, 'debts'),
        sbGetForUser(userId, 'settings'),
        sbGetForUser(userId, 'email-notif-state'),
      ])

      if (!debtsRaw || !Array.isArray(debtsRaw)) {
        globalLog.push(`[${userId.slice(0, 8)}] SKIP — no debts`)
        continue
      }

      const debts: Debt[]     = debtsRaw as Debt[]
      const userEmail: string = String(settings?.userEmail ?? '')
      const strategy: string  = String(settings?.strategy ?? 'cashflow')
      const income: number    = Number(settings?.income ?? 0)
      const interestBoost     = Boolean(settings?.interestBoost ?? true)

      const notifState: { sent: Record<string, { sentAt: string; fingerprint: string }> } =
        (notifStateRaw as typeof notifState) ?? { sent: {} }

      // Active debts only
      const active = debts.filter((d) => Number(d.remainingBalance ?? 0) > 0 && d.dueDate)
      const ranked  = rankDebts(active, strategy, income, interestBoost)
      const topName = String(ranked[0]?.name ?? active[0]?.name ?? '')

      // Group by next-due date
      const byDate: Record<string, { date: Date; debts: Debt[] }> = {}
      for (const d of active) {
        const next = getNextDueDate(Number(d.dueDate))
        const key  = next.toISOString().slice(0, 10)
        if (!byDate[key]) byDate[key] = { date: next, debts: [] }
        byDate[key].debts.push(d)
      }

      for (const [dateStr, group] of Object.entries(byDate)) {
        const daysLeft = Math.round((group.date.getTime() - todayPH.getTime()) / dayMs)

        for (const win of WINDOWS) {
          if (daysLeft !== win.days) continue

          const stateKey    = `${dateStr}-${win.label}`
          const fingerprint = groupFingerprint(group.debts, stateKey)
          const prev        = notifState.sent[stateKey]

          if (prev?.fingerprint === fingerprint) {
            log.push(`SKIP ${stateKey} (identical, already sent)`)
            continue
          }

          const totalDue = group.debts.reduce(
            (s, d) => s + Number(d.minimumPayment ?? d.monthlyPayment ?? 0), 0,
          )
          const debtListText = group.debts
            .map((d) => `• ${d.name} – ${formatPHP(Number(d.minimumPayment ?? d.monthlyPayment ?? 0))}`)
            .join('\n')
          const debtListHtml = group.debts
            .map(
              (d) =>
                `<tr><td style="padding:6px 12px 6px 0;color:#cbd5e1;font-size:14px;">${d.name}</td>` +
                `<td align="right" style="padding:6px 0;color:#f1f5f9;font-size:14px;font-weight:600;">${formatPHP(Number(d.minimumPayment ?? d.monthlyPayment ?? 0))}</td></tr>`,
            )
            .join('')

          try {
            await sendEmail({
              to_email:       userEmail,
              subject:        win.subject,
              due_date:       formatDateLong(group.date),
              days_left:      win.days,
              debt_count:     group.debts.length,
              total_due:      formatPHP(totalDue),
              debt_list:      debtListText,
              debt_list_html: debtListHtml,
              priority_debt:  topName,
            })
            notifState.sent[stateKey] = { sentAt: new Date().toISOString(), fingerprint }
            log.push(`SENT ${stateKey} to ${userEmail}`)
          } catch (err) {
            log.push(`ERROR ${stateKey}: ${(err as Error).message}`)
          }
        }
      }

      // Persist updated sent-state for this user
      await sbSetForUser(userId, 'email-notif-state', notifState)
      globalLog.push(`[${userId.slice(0, 8)}] ${log.join(' | ') || 'nothing to send'}`)
    }

    return new Response(JSON.stringify({ ok: true, users: userIds.length, log: globalLog }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 })
  }
})
