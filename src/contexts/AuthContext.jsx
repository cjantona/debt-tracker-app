import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, supabaseEnabled } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

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
    return { data, error }
  }, [])

  const signIn = useCallback(async (email, password) => {
    if (!supabaseEnabled || !supabase) {
      return { data: null, error: new Error('Supabase is not configured') }
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabaseEnabled || !supabase) return
    await supabase.auth.signOut()
  }, [])

  const isVerified = user?.email_confirmed_at != null

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut, isVerified }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
