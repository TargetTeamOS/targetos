// ═══════════════════════════════════════════════════════════════
// AddressAutocomplete — Google Places Autocomplete
// Attaches Google's native Autocomplete widget directly to the
// input DOM node. No custom dropdown management — Google handles
// everything. Input is uncontrolled to prevent cursor-jump.
// ═══════════════════════════════════════════════════════════════
import React, { useEffect, useRef, useState } from 'react'

const ff  = 'Inter, system-ui, -apple-system, sans-serif'
const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || 'AIzaSyAgxix5MkxxNo1F5DPdrab3JMce2aSMe6c'

// ── Load script once, globally ──────────────────────────────────
let _state = 'idle'  // idle | loading | ready
const _cbs = []

function ensureMapsLoaded(cb) {
  if (_state === 'ready') { cb(); return }
  _cbs.push(cb)
  if (_state === 'loading') return
  _state = 'loading'

  if (!KEY) {
    _state = 'ready'
    _cbs.forEach(f => f()); _cbs.length = 0
    return
  }

  // If script already added by another instance or Signs map
  if (window.google?.maps?.places) {
    _state = 'ready'
    _cbs.forEach(f => f()); _cbs.length = 0
    return
  }

  // Wait for any existing gmap script
  const existing = document.getElementById('__gmaps__') || document.querySelector('script[src*="maps.googleapis.com"]')
  if (existing) {
    existing.addEventListener('load', () => {
      _state = 'ready'; _cbs.forEach(f => f()); _cbs.length = 0
    }, { once: true })
    // If already loaded but state not updated
    if (window.google?.maps?.places) {
      _state = 'ready'; _cbs.forEach(f => f()); _cbs.length = 0
    }
    return
  }

  const script    = document.createElement('script')
  script.id       = '__gmaps__'
  script.src      = 'https://maps.googleapis.com/maps/api/js?key=' + KEY + '&libraries=places'
  script.async    = true
  script.defer    = true
  script.onload   = () => { _state = 'ready'; _cbs.forEach(f => f()); _cbs.length = 0 }
  script.onerror  = () => { console.error('Google Maps failed to load'); _state = 'error' }
  document.head.appendChild(script)

  // Suppress Google's "can't load" dialog — happens when key has wrong restrictions
  const origAlert = window.alert
  window.alert = function(msg) {
    if (typeof msg === 'string' && msg.toLowerCase().includes('google maps')) return
    origAlert.call(window, msg)
  }
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
  const [keyError, setKeyError] = useState(false)
  const inputRef = useRef(null)
  const acRef    = useRef(null)   // google.maps.places.Autocomplete instance
  const initDone = useRef(false)

  // ── Sync external value into DOM (only for initial load / form reset) ──
  // We use a ref flag so we only sync when the component first mounts
  // or when the form is explicitly reset, not on every parent re-render.
  const lastExternal = useRef(value)
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    // Only update DOM if the value changed significantly from outside
    // (i.e. parent loaded a different record, not just reflecting our own typing)
    if (value !== lastExternal.current) {
      lastExternal.current = value
      if (el.value !== value) {
        el.value = value
      }
    }
  })

  // ── Attach Google Autocomplete to the input ──────────────────
  // Google fires this when API key is invalid/restricted
  useEffect(() => {
    window.gm_authFailure = () => { setKeyError(true) }
    return () => { delete window.gm_authFailure }
  }, [])

  useEffect(() => {
    const el = inputRef.current
    if (!el || initDone.current) return

    ensureMapsLoaded(() => {
      if (!window.google?.maps?.places) return
      if (initDone.current) return
      initDone.current = true

      // Create native Google Autocomplete on the real DOM input
      const ac = new window.google.maps.places.Autocomplete(el, {
        componentRestrictions: { country: 'us' },
        fields:  ['formatted_address', 'geometry', 'address_components', 'name'],
        // Bias results toward Rockland County NY area
        bounds:  new window.google.maps.LatLngBounds(
          new window.google.maps.LatLng(40.98, -74.25),  // SW corner
          new window.google.maps.LatLng(41.35, -73.85),  // NE corner
        ),
        strictBounds: false,
      })
      acRef.current = ac

      // When user picks a suggestion
      ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        if (!place?.address_components) {
          // User pressed Enter without selecting — just use what's in the input
          onChange && onChange(el.value)
          return
        }

        const comps = place.address_components
        const get   = (...types) => comps.find(c => types.some(t => c.types.includes(t)))?.long_name  || ''
        const getS  = (...types) => comps.find(c => types.some(t => c.types.includes(t)))?.short_name || ''

        const streetNum  = get('street_number')
        const streetName = get('route')
        const city       = get('locality', 'sublocality', 'neighborhood')
        const state      = getS('administrative_area_level_1')
        const zip        = get('postal_code')
        const lat        = place.geometry?.location?.lat()
        const lng        = place.geometry?.location?.lng()
        const street     = [streetNum, streetName].filter(Boolean).join(' ') || el.value

        onChange && onChange(street)
        onSelect && onSelect({ full: place.formatted_address, street, city, state, zip, lat, lng })
      })
    })

    // Cleanup
    return () => {
      if (acRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(acRef.current)
        acRef.current = null
      }
      initDone.current = false
    }
  }, []) // Empty deps — only run once on mount

  // When user types, just call onChange (Google handles the dropdown natively)
  function handleChange(e) {
    lastExternal.current = e.target.value
    onChange && onChange(e.target.value)
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        ref={inputRef}
        defaultValue={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        name={name}
        autoComplete="off"
        spellCheck={false}
        style={{
          width: '100%', padding: '8px 10px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--inp)',
          color: 'var(--text)', fontSize: 13, fontFamily: ff,
          boxSizing: 'border-box', outline: 'none',
          ...style,
        }}
      />
      {!KEY && (
        <div style={{ fontSize: 10, color: '#F5A623', marginTop: 3, fontFamily: ff }}>
          ⚠️ VITE_GOOGLE_MAPS_KEY not set — add to Vercel environment variables
        </div>
      )}
      {keyError && (
        <div style={{ fontSize: 10, color: '#DC2626', marginTop: 3, fontFamily: ff, lineHeight: 1.5 }}>
          ⚠️ Google Maps key error — check API key restrictions in Google Cloud Console.<br/>
          Make sure <strong>app.targetreteam.com</strong> is allowed and Places API + Maps JS API are enabled with billing.
        </div>
      )}
    </div>
  )
}
