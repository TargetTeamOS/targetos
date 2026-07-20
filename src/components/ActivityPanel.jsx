import { useAuth } from '../context/AuthContext'
import { RecordActivityFeed } from './RecordActivityFeed'

// ActivityPanel — the ONE component to show a record's own activity log
// on any page. Wraps RecordActivityFeed with the records.activity_log
// permission gate so visibility is admin-controllable per role.
//
// Usage:
//   <ActivityPanel table="deals" recordId={deal.id} recordName={deal.addr} />
//
// Every entity's update() in db.js already writes field-level diffs to
// audit_log (who / when / old→new), so any record with an id will show
// a populated history here automatically.
export function ActivityPanel({ table, recordId, recordName, title = 'Activity Log', compact = false }) {
  const { can, agent } = useAuth()
  if (!can || !can('records.activity_log')) return null
  if (!recordId) return null
  return (
    <RecordActivityFeed table={table} recordId={recordId} compact={compact} />
  )
}
