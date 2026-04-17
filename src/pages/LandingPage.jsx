import { Link } from 'react-router-dom'

const FEATURES = [
  {
    icon: '📊',
    title: 'Smart Debt Tracking',
    desc: 'Track balances, interest rates, due dates, and payment history across all your accounts.',
  },
  {
    icon: '🎯',
    title: 'Repayment Strategies',
    desc: 'Choose Cashflow Priority, Snowball, or Interest-first. See your burn-down chart in real time.',
  },
  {
    icon: '🔔',
    title: 'Payment Reminders',
    desc: 'Get email alerts 1, 3, and 7 days before each due date. Never miss a payment again.',
  },
  {
    icon: '🛡️',
    title: 'Budget Safety Guardrails',
    desc: 'Auto-enforced 50% salary rule prevents over-allocation on extra debt payments.',
  },
  {
    icon: '⚡',
    title: 'Min Payment Planner',
    desc: 'Calculate minimum dues, finance charges, and see how extra payments accelerate payoff.',
  },
  {
    icon: '🔀',
    title: 'Consolidation Simulator',
    desc: 'Model a consolidation loan and compare it against your current payment plan.',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans">

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-xl font-bold text-slate-800">
            <span className="text-indigo-600">Debt</span>Tracker
          </span>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors px-3 py-1.5"
            >
              Sign In
            </Link>
            <Link
              to="/signup"
              className="text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 text-white">
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '60px 60px' }}
        />
        <div className="relative max-w-5xl mx-auto px-6 py-28 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm mb-8">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Free • Secure • No credit card required
          </div>
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
            Take control of<br />
            <span className="text-indigo-300">your debt journey</span>
          </h1>
          <p className="text-xl text-indigo-200 mb-10 max-w-2xl mx-auto">
            A personal financial control panel built for Filipinos. Track, plan, and eliminate
            debt with smart strategies and automated reminders.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/signup"
              className="bg-white text-indigo-700 font-semibold px-8 py-4 rounded-xl text-lg hover:bg-indigo-50 transition-colors shadow-lg"
            >
              Get Started Free →
            </Link>
            <Link
              to="/login"
              className="border border-white/30 text-white font-medium px-8 py-4 rounded-xl text-lg hover:bg-white/10 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats banner ─────────────────────────────────────────────── */}
      <section className="bg-slate-900 text-white py-10">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-3 gap-6 text-center">
          {[
            { value: '3', label: 'Repayment strategies' },
            { value: '3×', label: 'Notification windows' },
            { value: '100%', label: 'Data ownership' },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-4xl font-black text-indigo-400">{s.value}</div>
              <div className="text-sm text-slate-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-800 mb-4">
              Everything you need to get debt-free
            </h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              Purpose-built features designed around the Filipino context — salaries, minimum dues, and local banks.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-white rounded-2xl p-6 border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all"
              >
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-bold text-slate-800 mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="bg-indigo-600 py-20 px-6 text-center text-white">
        <h2 className="text-3xl font-bold mb-4">Ready to start your debt-free journey?</h2>
        <p className="text-indigo-200 mb-8">Sign up in seconds. No credit card needed.</p>
        <Link
          to="/signup"
          className="inline-block bg-white text-indigo-700 font-semibold px-8 py-4 rounded-xl text-lg hover:bg-indigo-50 transition-colors shadow-lg"
        >
          Create Free Account →
        </Link>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-500 text-sm text-center py-8">
        <p>© {new Date().getFullYear()} DebtTracker · Built for personal use</p>
      </footer>
    </div>
  )
}
