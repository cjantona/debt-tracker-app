import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function VerifyEmailPage() {
  const {
    user,
    signOut,
    verifyOtp,
    resendVerification,
    pendingEmail,
    supabaseEnabled,
  } = useAuth()
  const navigate = useNavigate()

  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const email = useMemo(() => user?.email || pendingEmail || '', [user?.email, pendingEmail])

  async function handleVerifyOtp(event) {
    event.preventDefault()
    setMessage('')
    setError('')

    if (!email) {
      setError('Email is required. Please sign up again.')
      return
    }

    const token = otp.trim()
    if (!/^\d{6}$/.test(token)) {
      setError('OTP must be exactly 6 digits.')
      return
    }

    setBusy(true)
    const { error: verifyError } = await verifyOtp(email, token)
    setBusy(false)

    if (verifyError) {
      setError(verifyError.message || 'Failed to verify OTP.')
      return
    }

    setMessage('Email verified. Redirecting to dashboard...')
    navigate('/app', { replace: true })
  }

  async function handleResend() {
    setMessage('')
    setError('')

    if (!email) {
      setError('No email found. Please sign up again.')
      return
    }

    setBusy(true)
    const { error: resendError } = await resendVerification(email)
    setBusy(false)

    if (resendError) {
      setError(resendError.message || 'Failed to resend verification email.')
      return
    }

    setMessage('Verification email sent. Check inbox and spam folder.')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="h-14 bg-white border-b border-slate-200 flex items-center px-6">
        <Link to="/" className="text-lg font-bold text-slate-800">
          <span className="text-indigo-600">Debt</span>Tracker
        </Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10">
            <div className="text-6xl mb-5">✉️</div>
            <h1 className="text-2xl font-bold text-slate-800 mb-3">Verify your account</h1>
            <p className="text-slate-500 mb-2">
              We sent a verification link and OTP to
            </p>
            {email && (
              <p className="font-semibold text-indigo-600 mb-6">{email}</p>
            )}
            <p className="text-sm text-slate-500 mb-8">
              Use either the magic link from your email, or paste your 6-digit OTP below.
            </p>

            {!supabaseEnabled && (
              <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-700 text-left">
                Supabase auth is not configured in this deployment environment.
              </div>
            )}

            {message && (
              <div className="mb-4 p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-700 text-left">
                {message}
              </div>
            )}
            {error && (
              <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 text-left">
                {error}
              </div>
            )}

            <form onSubmit={handleVerifyOtp} className="mb-5">
              <label className="block text-left text-sm font-medium text-slate-700 mb-1">
                6-digit OTP
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full mb-3 px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-800 text-sm tracking-[0.25em] text-center"
                placeholder="123456"
              />
              <button
                type="submit"
                disabled={busy || !supabaseEnabled}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
              >
                {busy ? 'Verifying...' : 'Verify OTP'}
              </button>
            </form>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleResend}
                disabled={busy || !supabaseEnabled}
                className="block w-full border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold py-2.5 rounded-lg transition-colors text-sm disabled:opacity-60"
              >
                Resend verification email
              </button>
              <Link
                to="/login"
                className="block w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
              >
                I've verified — Sign In
              </Link>
              <button
                onClick={signOut}
                className="block w-full text-sm text-slate-500 hover:text-slate-700 py-2 transition-colors"
              >
                Use a different email
              </button>
            </div>

            <p className="text-xs text-slate-400 mt-6">
              Didn't receive the email? Check spam or try resend.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
