// dashboardRoutes — the single source of truth for turning a CRM record into
// the EXISTING TargetOS route that already renders it. Widgets and the
// drill-down never invent new detail pages; they emit a record-row and ask
// this module for the destination. Every path here corresponds to a real
// <Route> already declared in App.jsx.
//
// Record-row contract (the shape widgets emit for a drill-down list):
//   {
//     id,                     // record id (required)
//     type,                   // 'contact' | 'deal' | 'listing' | 'task'
//                             // | 'appointment' | 'offer' | 'transaction'
//     label,                  // primary line (required)
//     secondary,              // optional supporting text
//     status,                 // optional status string/pill
//     related,                // optional { type, id, label } fallback target
//     route,                  // optional explicit override path
//   }

export const RECORD_ROUTES = {
  contact:     (id) => `/contacts/${id}/detail`,
  deal:        (id) => `/production/${id}`,
  listing:     (id) => `/listings/${id}`,
  task:        (id) => `/tasks/${id}`,
  appointment: (id) => `/calendar/${id}`,
  offer:       (id) => `/offers/${id}`,
  transaction: (id) => `/transactions/${id}`,
}

export const RECORD_TYPES = Object.keys(RECORD_ROUTES)

// Resolve a single record to its route, or null when the type/id is unknown.
export function resolveRecordRoute(type, id) {
  const build = RECORD_ROUTES[type]
  if (!build || id == null || id === '') return null
  return build(encodeURIComponent(String(id)))
}

// Resolve a record-row's destination with a clear precedence:
// explicit override → the row's own type → its related fallback.
export function rowRoute(row) {
  if (!row) return null
  if (row.route) return row.route
  const direct = resolveRecordRoute(row.type, row.id)
  if (direct) return direct
  if (row.related) return resolveRecordRoute(row.related.type, row.related.id)
  return null
}
