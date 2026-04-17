import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, supabaseEnabled } from '../lib/supabase'

const AuthContext = createContext(null)
const PENDING_EMAIL_KEY = 'debt-tracker:pending-email'

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [pendingEmail, setPendingEmail] = useState(() => {
    try {
      return localStorage.getItem(PENDING_EMAIL_KEY) || ''
    } catch {
      return ''
    }
  })

  const persistPendingEmail = useCallback((email) => {
    setPendingEmail(email || '')
    try {
      if (email) {
        localStorage.setItem(PENDING_EMAIL_KEY, email)
      } else {
        localStorage.removeItem(PENDING_EMAIL_KEY)
      }
    } catch {
      // ignore localStorage failures
    }
  }, [])

  useEffect(() => {
    if (!supabaseEnabled || !supabase) {
      setUser(null)
      setLoading(false)
      return
    }

    // Initial session check
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null)
      })
      .catch(() => {
        setUser(null)
      })
      .finally(() => {
        setLoading(false)
      })

    // Listen for auth state changes (login, logout, token refresh, email confirm)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user?.email) {
        persistPendingEmail(session.user.email)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signUp = useCallback(async (email, password) => {
    if (!supabaseEnabled || !supabase) {
      return { data: null, error: new Error('Supabase is not configured') }
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL || '/'}`,
      },
    })
    if (!error) {
      persistPendingEmail(email)
    }
    return { data, error }
  }, [persistPendingEmail])

  const signIn = useCallback(async (email, password) => {
    if (!supabaseEnabled || !supabase) {
      return { data: null, error: new Error('Supabase is not configured') }
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) {
      persistPendingEmail(email)
    }
    return { data, error }
  }, [persistPendingEmail])

  const signOut = useCallback(async () => {
    if (!supabaseEnabled || !supabase) return
    await supabase.auth.signOut()
  }, [])

  const verifyOtp = useCallback(async (email, token) => {
    if (!supabaseEnabled || !supabase) {
      return { data: null, error: new Error('Supabase is not configured') }
    }
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'signup',
    })
    if (!error) {
      persistPendingEmail(email)
    }
    return { data, error }
  }, [persistPendingEmail])

  const resendVerification = useCallback(async (email) => {
    if (!supabaseEnabled || !supabase) {
      return { data: null, error: new Error('Supabase is not configured') }
    }
    const { data, error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL || '/'}`,
      },
    })
    if (!error) {
      persistPendingEmail(email)
    }
    return { data, error }
  }, [persistPendingEmail])

  const isVerified = user?.email_confirmed_at != null

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signUp,
        signIn,
        signOut,
        verifyOtp,
        resendVerification,
        pendingEmail,
        isVerified,
        supabaseEnabled,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
