import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function VerifyEmailPage() {
  const { user, signOut } = useAuth()

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
            <h1 className="text-2xl font-bold text-slate-800 mb-3">Check your email</h1>
            <p className="text-slate-500 mb-2">
              We sent a verification link to
            </p>
            {user?.email && (
              <p className="font-semibold text-indigo-600 mb-6">{user.email}</p>
            )}
            <p className="text-sm text-slate-500 mb-8">
              Click the link in the email to activate your account.
              After verifying, come back and sign in.
            </p>

            <div className="space-y-3">
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
              Didn't receive the email? Check your spam folder.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
