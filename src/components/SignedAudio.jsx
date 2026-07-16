// ═══════════════════════════════════════════════════════════════
// SignedAudio — plays an audio file from the private bucket by
// resolving its stored path to a fresh signed URL on mount. Falls
// back to a legacy stored URL if no path is present.
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react'
import { signedUrl } from '../lib/storage'

export function SignedAudio({ path, fallbackUrl = null, style = {} }) {
  const [url, setUrl] = useState(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      const src = path ? await signedUrl(path) : (fallbackUrl ? await signedUrl(fallbackUrl) : null)
      if (!cancel) { if (src) setUrl(src); else setErr(true) }
    })()
    return () => { cancel = true }
  }, [path, fallbackUrl])

  if (err) return <div style={{ fontSize: 12, color: 'var(--muted)' }}>Recording unavailable</div>
  if (!url) return <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading recording…</div>
  return <audio controls src={url} style={{ width: '100%', ...style }} />
}
