// myDayModel — pure description of the My Day buckets and small accessors so the
// section order/labels are testable and shared. Row objects come straight from
// app_my_day() already shaped as record-rows ({id,type,label,secondary,...}).

export const MYDAY_SECTIONS = [
  { key: 'tasks_due_today',       title: 'Tasks due today',        accent: '#0073EA', kind: 'task',        actions: true },
  { key: 'tasks_overdue',         title: 'Overdue tasks',          accent: '#E2445C', kind: 'task',        actions: true },
  { key: 'reminders',             title: 'Reminders',              accent: '#FDAB3D', kind: 'task',        actions: true },
  { key: 'appointments_today',    title: 'Appointments today',     accent: '#A25DDC', kind: 'appointment', actions: 'event' },
  { key: 'appointments_upcoming', title: 'Upcoming appointments',  accent: '#579BFC', kind: 'appointment', actions: 'event' },
  { key: 'followups_due_today',   title: 'Follow-ups due today',   accent: '#00C875', kind: 'contact',     actions: 'followup' },
  { key: 'followups_overdue',     title: 'Overdue follow-ups',     accent: '#E2445C', kind: 'contact',     actions: 'followup' },
  { key: 'tasks_completed_today', title: 'Completed today',        accent: '#037f4c', kind: 'task',        actions: false },
]

export function bucket(data, key) {
  const a = data && data[key]
  return Array.isArray(a) ? a : []
}

export function totalCount(data) {
  return MYDAY_SECTIONS.reduce((n, s) => n + bucket(data, s.key).length, 0)
}

export function sectionMeta(key) {
  return MYDAY_SECTIONS.find((s) => s.key === key) || null
}
