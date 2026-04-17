// Supabase Edge Function: email-reminders
// Scheduled daily at 8:00 AM Philippine time (UTC+8 = 00:00 UTC)
// Deploy: supabase functions deploy email-reminders
// Schedule via Supabase Dashboard → Database → Cron Jobs

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

const EMAILJS_SERVICE_ID  = Deno.env.get('EMAILJS_SERVICE_ID')  ?? ''
const EMAILJS_TEMPLATE_ID = Deno.env.get('EMAILJS_TEMPLATE_ID') ?? ''
const EMAILJS_PUBLIC_KEY  = Deno.env.get('EMAILJS_PUBLIC_KEY')  ?? ''
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')         ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const KV_TABLE = 'kv_store'

// ── Supabase helpers ─────────────────────────────────────────────────────────
async function sbGet(key: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${KV_TABLE}?key=eq.${encodeURIComponent(key)}&select=data&limit=1`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    },
  )
  if (!res.ok) return null
  const rows = await res.json()
  return rows[0]?.data ?? null
}

async function sbSet(key: string, data: unknown) {
  await fetch(`${SUPABASE_URL}/rest/v1/${KV_TABLE}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ key, data }),
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

// ── Notification windows ─────────────────────────────────────────────────────
const WINDOWS = [
  { days: 1, label: '1day', subject: '🔴 Urgent: Payments Due Tomorrow' },
  { days: 3, label: '3day', subject: '⚠️ Upcoming Debt Due in 3 Days' },
  { days: 7, label: '7day', subject: '🟡 Payments Due This Week' },
]

// ── EmailJS send ─────────────────────────────────────────────────────────────
async function sendEmail(params: Record<string, unknown>) {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id:  EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id:     EMAILJS_PUBLIC_KEY,
      template_params: params,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`EmailJS ${res.status}: ${text}`)
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async () => {
  const log: string[] = []

  try {
    if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
      return new Response(JSON.stringify({ error: 'EmailJS env vars not set' }), { status: 500 })
    }

    // Load debts and settings from Supabase
    const [debts, settings] = await Promise.all([sbGet('debts'), sbGet('settings')])
    if (!debts || !Array.isArray(debts)) {
      return new Response(JSON.stringify({ error: 'No debts found in kv_store' }), { status: 404 })
    }

    const userEmail: string = settings?.userEmail ?? ''
    const emailEnabled: boolean = settings?.emailNotifEnabled ?? false

    if (!emailEnabled || !userEmail) {
      return new Response(JSON.stringify({ skipped: 'Email notifications disabled or no email set' }), { status: 200 })
    }

    // Load sent-state
    const notifState: { sent: Record<string, unknown> } = (await sbGet('email-notif-state')) ?? { sent: {} }
    const now = new Date()
    const todayPH = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
    todayPH.setHours(0, 0, 0, 0)
    const dayMs = 24 * 60 * 60 * 1000

    // Active debts only
    const active = (debts as Record<string, unknown>[]).filter(
      (d) => Number(d.remainingBalance ?? 0) > 0 && d.dueDate,
    )

    // Group by due-date string
    const byDate: Record<string, { date: Date; debts: Record<string, unknown>[] }> = {}
    for (const d of active) {
      const next = getNextDueDate(Number(d.dueDate))
      const key = next.toISOString().slice(0, 10)
      if (!byDate[key]) byDate[key] = { date: next, debts: [] }
      byDate[key].debts.push(d)
    }

    // Sort debts by priority score (cashflow default: minDue / remainingBalance ratio)
    const topDebt = active.sort((a, b) => {
      const ra = Number(a.remainingBalance ?? 0)
      const rb = Number(b.remainingBalance ?? 0)
      const ma = Number(a.monthlyPayment ?? 0)
      const mb = Number(b.monthlyPayment ?? 0)
      return rb === 0 ? -1 : ra === 0 ? 1 : (mb / rb) - (ma / ra)
    })[0]

    for (const [dateStr, group] of Object.entries(byDate)) {
      const daysLeft = Math.round((group.date.getTime() - todayPH.getTime()) / dayMs)

      for (const win of WINDOWS) {
        if (daysLeft !== win.days) continue

        const stateKey = `${dateStr}-${win.label}`
        if (notifState.sent[stateKey]) {
          log.push(`SKIP ${stateKey} (already sent)`)
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
              `<tr><td style="padding:6px 12px 6px 0;color:#cbd5e1;font-size:14px;">${d.name}</td><td align="right" style="padding:6px 0;color:#f1f5f9;font-size:14px;font-weight:600;">${formatPHP(Number(d.minimumPayment ?? d.monthlyPayment ?? 0))}</td></tr>`,
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
            priority_debt:  String(topDebt?.name ?? group.debts[0]?.name ?? ''),
          })
          notifState.sent[stateKey] = { sentAt: new Date().toISOString() }
          log.push(`SENT ${stateKey} to ${userEmail}`)
        } catch (err) {
          log.push(`ERROR ${stateKey}: ${(err as Error).message}`)
        }
      }
    }

    // Persist updated state
    await sbSet('email-notif-state', notifState)

    return new Response(JSON.stringify({ ok: true, log }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 })
  }
})
