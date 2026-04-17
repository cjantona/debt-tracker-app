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

// ── Supabase (cloud fallback) ─────────────────────────────────────────────────
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local to enable.
// Table required: kv_store (key text primary key, data jsonb)
const SB_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const SB_TABLE = 'kv_store'

function sbHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    Prefer: 'return=minimal',
  }
}

async function sbCheckConnection() {
  if (!SB_URL || !SB_KEY) return false
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(
      `${SB_URL}/rest/v1/${SB_TABLE}?key=eq.__health__&select=key&limit=1`,
      { headers: sbHeaders(), signal: controller.signal },
    )
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

async function sbLoad(key) {
  const res = await fetch(
    `${SB_URL}/rest/v1/${SB_TABLE}?key=eq.${encodeURIComponent(key)}&select=data&limit=1`,
    { headers: sbHeaders() },
  )
  if (!res.ok) throw new Error(`Supabase load ${res.status}`)
  const rows = await res.json()
  return rows[0]?.data ?? null
}

async function sbSave(key, data) {
  const res = await fetch(`${SB_URL}/rest/v1/${SB_TABLE}`, {
    method: 'POST',
    headers: {
      ...sbHeaders(),
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ key, data }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase save ${res.status}: ${text}`)
  }
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

