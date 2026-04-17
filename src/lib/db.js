import { supabase } from './supabase'

// ── PocketBase (local) ──────────────────────────────────────────────────────
const PB_URL = import.meta.env.VITE_PB_URL || 'http://127.0.0.1:8090'
const COLLECTION = 'kv_store'

async function pbRequest(path, options = {}) {
  const { signal, ...rest } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  try {
    const res = await fetch(`${PB_URL}/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: signal ?? controller.signal,
      ...rest,
    })
    clearTimeout(timer)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`PocketBase ${res.status}: ${text}`)
    }
    return await res.json()
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

async function pbGetRecord(key) {
  try {
    const result = await pbRequest(
      `/collections/${COLLECTION}/records?filter=(key='${encodeURIComponent(key)}')&perPage=1`,
    )
    return result.items?.[0] ?? null
  } catch {
    return null
  }
}

async function pbCheckConnection() {
  try {
    await pbRequest('/health', {})
    return true
  } catch {
    return false
  }
}

async function pbLoad(key) {
  const record = await pbGetRecord(key)
  return record?.data ?? null
}

async function pbSave(key, data) {
  const existing = await pbGetRecord(key)
  if (existing) {
    await pbRequest(`/collections/${COLLECTION}/records/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data }),
    })
  } else {
    await pbRequest(`/collections/${COLLECTION}/records`, {
      method: 'POST',
      body: JSON.stringify({ key, data }),
    })
  }
}

// ── Supabase (cloud) — uses @supabase/supabase-js client with auth session ────
async function sbCheckConnection() {
  if (!supabase || !import.meta.env.VITE_SUPABASE_URL) return false
  try {
    const { error } = await supabase.from('kv_store').select('key').limit(1)
    return !error
  } catch {
    return false
  }
}

async function sbLoad(key) {
  if (!supabase) return null
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) return null

  const { data, error } = await supabase
    .from('kv_store')
    .select('data')
    .eq('user_id', userId)
    .eq('key', key)
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
  return data?.data ?? null
}

async function sbSave(key, value) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('kv_store')
    .upsert({ user_id: userId, key, data: value }, { onConflict: 'user_id,key' })

  if (error) throw error
}

// ── Public API ────────────────────────────────────────────────────────────────
// Returns: 'pocketbase' | 'supabase' | 'offline'
export async function checkConnection() {
  if (await pbCheckConnection()) return 'pocketbase'
  if (await sbCheckConnection()) return 'supabase'
  return 'offline'
}

export async function dbLoad(key, backend) {
  try {
    if (backend === 'pocketbase') return await pbLoad(key)
    if (backend === 'supabase') return await sbLoad(key)
  } catch (err) {
    console.warn(`dbLoad(${backend}) failed:`, err.message)
  }
  return null
}

export async function dbSave(key, data, backend) {
  try {
    if (backend === 'pocketbase') { await pbSave(key, data); return true }
    if (backend === 'supabase') { await sbSave(key, data); return true }
  } catch (err) {
    console.warn(`dbSave(${backend}) failed:`, err.message)
  }
  return false
}

