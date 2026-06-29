// ═══════════════════════════════════════════════════════════════
// AddressAutocomplete — Google Places autocomplete
// Uses uncontrolled input internally to prevent cursor-jump on
// every keystroke (the classic React + Places conflict).
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect, useRef } from 'react'

const ff  = 'Inter, system-ui, -apple-system, sans-serif'
const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || ''

// ── Single global script loader ─────────────────────────────────
let _loaded  = false
let _loading = false
let _cbs     = []

function loadMaps(cb) {
  if (_loaded)  { cb(); return }
  _cbs.push(cb)
  if (_loading) return
  _loading = true
  if (!KEY) {
    // No key — resolve immediately so fallback renders
    _loaded = true
    _cbs.forEach(f => f()); _cbs = []
    return
  }
  // Reuse script if already in DOM (handles HMR / double-mount)
  const existing = document.getElementById('__gmap_places__')
  if (existing) {
    existing.addEventListener('load', () => {
      _loaded = true; _cbs.forEach(f => f()); _cbs = []
    })
    return
  }
  const s = document.createElement('script')
  s.id    = '__gmap_places__'
  s.src   = 'https://maps.googleapis.com/maps/api/js?key=' + KEY + '&libraries=places'
  s.async = true
  s.onload = () => { _loaded = true; _cbs.forEach(f => f()); _cbs = [] }
  document.head.appendChild(s)
}

// ── Component ───────────────────────────────────────────────────
export function AddressAutocomplete({
  value       = '',
  onChange,
  onSelect,
  placeholder = 'Start typing an address...',
  style       = {},
  disabled,
  required,
  name,
}) {
  const inputRef  = useRef(null)   // real DOM input — uncontrolled internally
  const svcRef    = useRef(null)   // AutocompleteService
  const sessRef   = useRef(null)   // Session token
  const timerRef  = useRef(null)   // debounce timer
  const skipRef   = useRef(false)  // skip next onChange (after selection)

  const [ready,   setReady]   = useState(false)
  const [results, setResults] = useState([])
  const [show,    setShow]    = useState(false)
  const [hi,      setHi]      = useState(-1)

  // ── Load Maps once ────────────────────────────────────────────
  useEffect(() => {
    loadMaps(() => {
      if (window.google?.maps?.places) {
        svcRef.current  = new window.google.maps.places.AutocompleteService()
        sessRef.current = new window.google.maps.places.AutocompleteSessionToken()
      }
      setReady(true)
    })
  }, [])

  // ── Sync external value → DOM (only when value changes from outside) ──
  // This lets the parent set a value (e.g. loading a saved form) without
  // interfering with the user's active typing session.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    // Only update DOM if the value actually differs (avoid overwriting mid-type)
    if (el.value !== value) {
      el.value = value
    }
  }, [value])

  // ── Fetch predictions (debounced 300ms) ──────────────────────
  function fetchPredictions(text) {
    clearTimeout(timerRef.current)
    if (!text || text.length < 3 || !svcRef.current) {
      setResults([]); setShow(false); return
    }
    timerRef.current = setTimeout(() => {
      svcRef.current.getPlacePredictions(
        {
          input:        text,
          sessionToken: sessRef.current,
          componentRestrictions: { country: 'us' },
          location: new window.google.maps.LatLng(41.11, -74.05), // Rockland County
          radius:   60000,
        },
        (predictions, status) => {
          if (status === 'OK' && predictions?.length) {
            setResults(predictions)
            setShow(true)
            setHi(-1)
          } else {
            setResults([]); setShow(false)
          }
        }
      )
    }, 300)
  }

  // ── Handle user typing ───────────────────────────────────────
  function onInput(e) {
    const text = e.target.value
    if (skipRef.current) { skipRef.current = false; return }
    onChange && onChange(text)
    fetchPredictions(text)
  }

  // ── Select a prediction ──────────────────────────────────────
  function pick(prediction) {
    setShow(false); setResults([])
    clearTimeout(timerRef.current)

    // Immediately put the description in the input so it feels instant
    const el = inputRef.current
    if (el) el.value = prediction.structured_formatting?.main_text || prediction.description

    // Get full details for lat/lng + structured fields
    const svc = new window.google.maps.places.PlacesService(document.createElement('div'))
    svc.getDetails(
      {
        placeId:      prediction.place_id,
        sessionToken: sessRef.current,
        fields:       ['formatted_address', 'geometry', 'address_components'],
      },
      (place, status) => {
        // Fresh session token for next search
        sessRef.current = new window.google.maps.places.AutocompleteSessionToken()

        let streetAddr = prediction.structured_formatting?.main_text || prediction.description
        let structured = { full: prediction.description, street: streetAddr }

        if (status === 'OK' && place) {
          const comps = place.address_components || []
          const get   = (...types) => comps.find(c => types.some(t => c.types.includes(t)))?.long_name  || ''
          const getS  = (...types) => comps.find(c => types.some(t => c.types.includes(t)))?.short_name || ''
          const num   = get('street_number')
          const route = get('route')
          const city  = get('locality', 'sublocality', 'neighborhood')
          const state = getS('administrative_area_level_1')
          const zip   = get('postal_code')
          const lat   = place.geometry?.location?.lat()
          const lng   = place.geometry?.location?.lng()
          let street  = [num, route].filter(Boolean).join(' ')
          streetAddr  = street || place.formatted_address
          structured  = { full: place.formatted_address, street: streetAddr, city, state, zip, lat, lng }
        }

        // Update DOM input with clean street address
        skipRef.current = true
        if (el) el.value = streetAddr
        onChange && onChange(streetAddr)
        onSelect && onSelect(structured)
      }
    )
  }

  // ── Keyboard navigation ──────────────────────────────────────
  function onKeyDown(e) {
    if (!show || !results.length) return
    if (e.key === 'ArrowDown')  { e.preventDefault(); setHi(h => Math.min(h+1, results.length-1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h-1, 0)) }
    else if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); pick(results[hi]) }
    else if (e.key === 'Escape') { setShow(false) }
  }

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--inp)',
    color: 'var(--text)', fontSize: 13, fontFamily: ff,
    boxSizing: 'border-box', outline: 'none',
    ...style,
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        ref={inputRef}
        defaultValue={value}
        onInput={onInput}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setShow(false), 160)}
        onFocus={() => { if (results.length) setShow(true) }}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        name={name}
        autoComplete="off"
        spellCheck={false}
        style={inputStyle}
      />

      {/* Dropdown */}
      {show && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'var(--panel)', border: '1px solid var(--border)',
          borderTop: 'none', borderRadius: '0 0 10px 10px',
          boxShadow: '0 8px 28px rgba(0,0,0,.18)', zIndex: 9999,
          maxHeight: 280, overflowY: 'auto',
        }}>
          {results.map((r, i) => {
            const main = r.structured_formatting?.main_text || r.description
            const sec  = r.structured_formatting?.secondary_text || ''
            const active = i === hi
            return (
              <div
                key={r.place_id}
                onMouseDown={e => { e.preventDefault(); pick(r) }}
                onMouseEnter={() => setHi(i)}
                style={{
                  padding: '10px 14px', cursor: 'pointer',
                  background: active ? 'var(--dim,#f1f5f9)' : 'transparent',
                  borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>📍</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: ff }}>{main}</div>
                  {sec && <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: ff, marginTop: 2 }}>{sec}</div>}
                </div>
              </div>
            )
          })}
          <div style={{ padding: '4px 12px 6px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
            <img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3_hdpi.png"
              alt="Powered by Google" style={{ height: 13, opacity: .55 }} />
          </div>
        </div>
      )}

      {!KEY && (
        <div style={{ fontSize: 10, color: '#F5A623', marginTop: 3, fontFamily: ff }}>
          ⚠️ Add VITE_GOOGLE_MAPS_KEY to Vercel environment variables to enable address autocomplete
        </div>
      )}
    </div>
  )
}
