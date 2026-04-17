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

async function getRecord(key) {
  try {
    const result = await pbRequest(
      `/collections/${COLLECTION}/records?filter=(key='${encodeURIComponent(key)}')&perPage=1`,
    )
    return result.items?.[0] ?? null
  } catch {
    return null
  }
}

export async function checkConnection() {
  try {
    await pbRequest('/health', {})
    return true
  } catch {
    return false
  }
}

export async function dbLoad(key) {
  const record = await getRecord(key)
  return record?.data ?? null
}

export async function dbSave(key, data) {
  try {
    const existing = await getRecord(key)
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
    return true
  } catch (err) {
    console.warn('PocketBase save failed, using localStorage only:', err.message)
    return false
  }
}
