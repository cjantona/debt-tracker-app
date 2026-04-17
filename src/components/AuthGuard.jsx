import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/**
 * Wraps protected routes. Redirects to /login if not authenticated.
 * Redirects to /verify if authenticated but email not confirmed.
 */
export default function AuthGuard({ children }) {
  const { user, loading, isVerified } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (!user) {
      navigate('/login', { replace: true })
    } else if (!isVerified) {
      navigate('/verify', { replace: true })
    }
  }, [user, loading, isVerified, navigate])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user || !isVerified) return null

  return children
}
