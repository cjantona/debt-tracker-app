import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

type Debt = {
  id: string
  name: string
  remainingBalance: number
  monthlyPayment: number
  monthsRemaining: number
  interestRate: number
}

function scoreDebt(
  debt: Debt,
  strategy = 'cashflow',
  income = 0,
  interestBoost = true,
): number {
  const balance = Number(debt.remainingBalance ?? 0)
  if (balance <= 0) return -1
  if (strategy === 'snowball') return 100000 - balance

  const rate = Number(debt.interestRate ?? 0)
  const monthly = Number(debt.monthlyPayment ?? 0)
  const months = Number(debt.monthsRemaining ?? 0)

  if (strategy === 'interest') return rate * 1000 + monthly

  const burden = monthly / Math.max(1, income)
  const interestScore = interestBoost ? rate * 100 : 0
  return monthly * 3 + months * 9 + burden * 500 + interestScore
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  try {
    const body = await req.json()
    const debts: Debt[] = Array.isArray(body?.debts) ? body.debts : []
    const strategy = String(body?.strategy || 'cashflow')
    const income = Number(body?.income || 0)
    const interestBoost = Boolean(body?.interestBoost ?? true)

    const ranked = [...debts]
      .filter((d) => Number(d.remainingBalance ?? 0) > 0)
      .sort(
        (a, b) =>
          scoreDebt(b, strategy, income, interestBoost) -
          scoreDebt(a, strategy, income, interestBoost),
      )

    return new Response(JSON.stringify({ ok: true, ranked }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
})
