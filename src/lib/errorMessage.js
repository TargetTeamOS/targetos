// Convert unknown API/provider errors into a stable user-facing string.
// Raw response objects must never render as "[object Object]".
export function safeErrorMessage(value, fallback = 'Request failed') {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value instanceof Error) return safeErrorMessage(value.message, fallback)
  if (value && typeof value === 'object') {
    for (const key of ['message', 'error_description', 'error', 'detail']) {
      const candidate = safeErrorMessage(value[key], '')
      if (candidate) return candidate
    }
  }
  return fallback
}

