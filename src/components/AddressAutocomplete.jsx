// ═══════════════════════════════════════════════════════════════
// AddressAutocomplete — Google Places autocomplete for any input
// Drop-in replacement for any address text input.
// Requires VITE_GOOGLE_MAPS_KEY in environment.
// Usage:
//   <AddressAutocomplete
//     value={form.addr}
//     onChange={v => set('addr', v)}
//     placeholder="123 Main St, Monsey NY"
//   />
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useCallback } from 'react'

const ff = 'Inter, system-ui, -apple-system, sans-serif'
const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || ''

// Load Google Maps script once globally
let gmapsLoaded    = false
let gmapsLoading   = false
let gmapsCallbacks = []

function loadGoogleMaps(cb) {
  if (gmapsLoaded)  { cb(); return }
  gmapsCallbacks.push(cb)
  if (gmapsLoading) return
  gmapsLoading = true

  if (!KEY) {
    console.warn('AddressAutocomplete: VITE_GOOGLE_MAPS_KEY not set')
    gmapsCallbacks.forEach(fn => fn())
    gmapsCallbacks = []
    return
  }

  const script    = document.createElement('script')
  script.src      = `https://maps.googleapis.com/maps/api/js?key=${KEY}&libraries=places`
  script.async    = true
  script.onload   = () => {
    gmapsLoaded = true
    gmapsCallbacks.forEach(fn => fn())
    gmapsCallbacks = []
  }
  document.head.appendChild(script)
}

export function AddressAutocomplete({
  value        = '',
  onChange,
  onSelect,       // optional: called with full place object
  placeholder  = 'Start typing an address...',
  style        = {},
  className,
  disabled,
  required,
  name,
}) {
  const inputRef    = useRef(null)
  const acRef       = useRef(null)     // Google Autocomplete instance
  const [ready,     setReady]     = useState(false)
  const [results,   setResults]   = useState([])
  const [showList,  setShowList]  = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const svcRef      = useRef(null)     // AutocompleteService for custom dropdown
  const sessionRef  = useRef(null)

  // Load Google Maps
  useEffect(() => {
    loadGoogleMaps(() => {
      if (window.google?.maps?.places) {
        svcRef.current     = new window.google.maps.places.AutocompleteService()
        sessionRef.current = new window.google.maps.places.AutocompleteSessionToken()
        setReady(true)
      }
    })
  }, [])

  // Fetch predictions when value changes
  useEffect(() => {
    if (!ready || !value || value.length < 3) { setResults([]); return }
    if (!svcRef.current) return

    svcRef.current.getPlacePredictions(
      {
        input:        value,
        sessionToken: sessionRef.current,
        componentRestrictions: { country: 'us' },
        // Bias toward Rockland County NY area
        location: new window.google.maps.LatLng(41.1100, -74.0478),
        radius:   50000,
        // No types filter — allows partial street numbers like "16 Lawrence" to resolve
      },
      (predictions, status) => {
        if (status === 'OK' && predictions) {
          setResults(predictions)
          setShowList(true)
          setHighlight(-1)
        } else {
          setResults([])
          setShowList(false)
        }
      }
    )
  }, [value, ready])

  function selectPrediction(prediction) {
    const svc = new window.google.maps.places.PlacesService(document.createElement('div'))
    svc.getDetails(
      {
        placeId:      prediction.place_id,
        sessionToken: sessionRef.current,
        fields:       ['formatted_address', 'geometry', 'address_components'],
      },
      (place, status) => {
        if (status === 'OK') {
          // Parse address components into structured fields
          const comps  = place.address_components || []
          const get    = (types) => comps.find(c => types.some(t => c.types.includes(t)))?.long_name || ''
          const getS   = (types) => comps.find(c => types.some(t => c.types.includes(t)))?.short_name || ''

          const streetNum  = get(['street_number'])
          const streetName = get(['route'])
          const unit       = get(['subpremise'])
          const city       = get(['locality']) || get(['sublocality']) || get(['neighborhood'])
          const state      = getS(['administrative_area_level_1'])
          const zip        = get(['postal_code'])
          const lat        = place.geometry?.location?.lat()
          const lng        = place.geometry?.location?.lng()

          // Build clean street address (without city/state/zip)
          let street = [streetNum, streetName].filter(Boolean).join(' ')
          if (unit) street += ' #' + unit

          const structured = {
            full:   place.formatted_address,
            street, unit, city, state, zip,
            lat, lng,
          }

          onChange(street || place.formatted_address)
          if (onSelect) onSelect(structured)
          sessionRef.current = new window.google.maps.places.AutocompleteSessionToken()
        } else {
          onChange(prediction.description)
        }
      }
    )
    setShowList(false)
    setResults([])
  }

  function onKeyDown(e) {
    if (!showList || !results.length) return
    if (e.key === 'ArrowDown')  { e.preventDefault(); setHighlight(h => Math.min(h+1, results.length-1)) }
    if (e.key === 'ArrowUp')    { e.preventDefault(); setHighlight(h => Math.max(h-1, 0)) }
    if (e.key === 'Enter' && highlight >= 0) { e.preventDefault(); selectPrediction(results[highlight]) }
    if (e.key === 'Escape')     { setShowList(false) }
  }

  const baseStyle = {
    width:       '100%',
    padding:     '8px 10px',
    borderRadius: 8,
    border:      '1px solid var(--border)',
    background:  'var(--inp)',
    color:       'var(--text)',
    fontSize:    13,
    fontFamily:  ff,
    boxSizing:   'border-box',
    outline:     'none',
    ...style,
  }

  return (
    <div style={{ position:'relative', width:'100%' }}>
      <input
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setShowList(false), 150)}
        onFocus={() => { if (results.length) setShowList(true) }}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        name={name}
        autoComplete="off"
        style={baseStyle}
        className={className}
      />

      {/* Autocomplete dropdown */}
      {showList && results.length > 0 && (
        <div style={{
          position:   'absolute',
          top:        '100%',
          left:       0,
          right:      0,
          background: 'var(--panel)',
          border:     '1px solid var(--border)',
          borderTop:  'none',
          borderRadius: '0 0 8px 8px',
          boxShadow:  '0 8px 24px rgba(0,0,0,.15)',
          zIndex:     1000,
          maxHeight:  260,
          overflowY:  'auto',
        }}>
          {results.map((r, i) => {
            const main  = r.structured_formatting?.main_text || r.description
            const sec   = r.structured_formatting?.secondary_text || ''
            return (
              <div
                key={r.place_id}
                onMouseDown={e => { e.preventDefault(); selectPrediction(r) }}
                style={{
                  padding:    '9px 12px',
                  cursor:     'pointer',
                  background: i === highlight ? 'var(--hov,#f1f5f9)' : 'transparent',
                  borderBottom: i < results.length-1 ? '1px solid var(--border)' : 'none',
                  display:    'flex',
                  alignItems: 'flex-start',
                  gap:        8,
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span style={{ fontSize:14, flexShrink:0, marginTop:1 }}>📍</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', fontFamily:ff }}>{main}</div>
                  {sec && <div style={{ fontSize:11, color:'var(--muted)', fontFamily:ff, marginTop:1 }}>{sec}</div>}
                </div>
              </div>
            )
          })}
          {/* Google attribution */}
          <div style={{ padding:'4px 10px', display:'flex', justifyContent:'flex-end' }}>
            <img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3_hdpi.png"
              alt="Powered by Google" style={{ height:14, opacity:.6 }} />
          </div>
        </div>
      )}

      {/* No key warning */}
      {!KEY && (
        <div style={{ fontSize:10, color:'#F5A623', marginTop:3, fontFamily:ff }}>
          ⚠️ Add VITE_GOOGLE_MAPS_KEY to Vercel to enable address autocomplete
        </div>
      )}
    </div>
  )
}
