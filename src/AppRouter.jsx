import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import AuthGuard from './components/AuthGuard'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import Dashboard from './App'

export default function AppRouter() {
  const { user, loading, isVerified } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={
        user && isVerified ? <Navigate to="/app" replace /> : <LandingPage />
      } />
      <Route path="/login" element={
        user && isVerified ? <Navigate to="/app" replace /> : <LoginPage />
      } />
      <Route path="/signup" element={
        user && isVerified ? <Navigate to="/app" replace /> : <SignupPage />
      } />
      <Route path="/verify" element={<VerifyEmailPage />} />

      {/* Protected */}
      <Route path="/app" element={
        <AuthGuard>
          <Dashboard />
        </AuthGuard>
      } />
      <Route path="/dashboard" element={<Navigate to="/app" replace />} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
