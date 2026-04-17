import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function SignupPage() {
  const { signUp, supabaseEnabled } = useAuth()
  const navigate   = useNavigate()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [loading, setLoading]   = useState(false)

  const emailValid = /^\S+@\S+\.\S+$/.test(email)
  const passwordValid = password.length >= 8
  const passwordsMatch = confirm.length === 0 || password === confirm

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!supabaseEnabled) {
      setError('Authentication is unavailable in this environment.')
      return
    }

    if (!emailValid) {
      setError('Enter a valid email address.')
      return
    }

    if (!passwordValid) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error: err } = await signUp(email, password)
    setLoading(false)

    if (err) {
      setError(err.message || 'Sign up failed. Please try again.')
      return
    }

    setSuccess('Account created. Check your inbox for verification.')
    navigate('/verify')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Nav */}
      <nav className="h-14 bg-white border-b border-slate-200 flex items-center px-6">
        <Link to="/" className="text-lg font-bold text-slate-800">
          <span className="text-indigo-600">Debt</span>Tracker
        </Link>
      </nav>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h1 className="text-2xl font-bold text-slate-800 mb-1">Create your account</h1>
            <p className="text-sm text-slate-500 mb-8">
              Free forever · Your data stays yours
            </p>

            {error && (
              <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-5 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-800 text-sm"
                  placeholder="you@example.com"
                />
                {email && !emailValid && (
                  <p className="mt-1 text-xs text-red-600">Enter a valid email format.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-800 text-sm"
                  placeholder="Min. 8 characters"
                />
                {password && !passwordValid && (
                  <p className="mt-1 text-xs text-red-600">Use at least 8 characters.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-800 text-sm"
                  placeholder="••••••••"
                />
                {!passwordsMatch && (
                  <p className="mt-1 text-xs text-red-600">Passwords do not match.</p>
                )}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
              >
                {loading ? 'Creating account…' : 'Create Account'}
              </button>
            </form>

            <p className="text-xs text-center text-slate-400 mt-6">
              By signing up you agree to keep your own financial data safe.
            </p>
            <p className="text-sm text-center text-slate-500 mt-3">
              Already have an account?{' '}
              <Link to="/login" className="text-indigo-600 font-medium hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
