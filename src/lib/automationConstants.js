// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Automation Constants
// Pure data — no imports, no side effects, no supabase.
// Safe to import from any page without circular dependency risk.
// ═══════════════════════════════════════════════════════════════

export const TRIGGERS = [
  {
    id:          'new_contact',
    label:       'New contact added',
    icon:        '👤',
    category:    'Contacts',
    description: 'Fires when a new contact is created',
    config:      [],
  },
  {
    id:          'contact_status_change',
    label:       'Contact status changes',
    icon:        '🔄',
    category:    'Contacts',
    description: 'Fires when a contact status is changed',
    config:      [
      { key: 'to_status',   label: 'New Status',  type: 'status_select', required: false },
      { key: 'from_status', label: 'From Status', type: 'status_select', required: false },
    ],
  },
  {
    id:          'no_activity',
    label:       'No contact activity for X days',
    icon:        '💤',
    category:    'Contacts',
    description: 'Fires when a contact has not been touched in a set number of days',
    config:      [
      { key: 'days', label: 'Number of Days', type: 'number', default: 14, required: true },
    ],
  },
  {
    id:          'deal_stage_change',
    label:       'Deal stage changes',
    icon:        '📊',
    category:    'Deals',
    description: 'Fires when a deal moves to a new stage',
    config:      [
      { key: 'to_stage',   label: 'New Stage',  type: 'stage_select', required: false },
      { key: 'from_stage', label: 'From Stage', type: 'stage_select', required: false },
    ],
  },
  {
    id:          'deal_created',
    label:       'New deal added',
    icon:        '✨',
    category:    'Deals',
    description: 'Fires when a new deal is created',
    config:      [],
  },
  {
    id:          'closing_soon',
    label:       'Deal closing within X days',
    icon:        '📅',
    category:    'Deals',
    description: 'Fires when a deal has a closing date approaching',
    config:      [
      { key: 'days', label: 'Days Before Closing', type: 'number', default: 7, required: true },
    ],
  },
  {
    id:          'task_overdue',
    label:       'Task becomes overdue',
    icon:        '⚠️',
    category:    'Tasks',
    description: 'Fires when a task passes its due date without being completed',
    config:      [],
  },
  {
    id:          'task_completed',
    label:       'Task is completed',
    icon:        '✅',
    category:    'Tasks',
    description: 'Fires when a task is marked done',
    config:      [],
  },
  {
    id:          'listing_status_change',
    label:       'Listing status changes',
    icon:        '🏡',
    category:    'Listings',
    description: 'Fires when a listing changes status',
    config:      [
      { key: 'to_status', label: 'New Status', type: 'listing_status_select', required: false },
    ],
  },
  {
    id:          'open_house_created',
    label:       'Open house scheduled',
    icon:        '🚪',
    category:    'Listings',
    description: 'Fires when a new open house is created',
    config:      [],
  },
  {
    id:          'offer_accepted',
    label:       'Offer accepted (AO)',
    icon:        '🤝',
    category:    'Deals',
    description: 'Fires when a deal is moved to Offer Accepted stage',
    config:      [],
  },
  {
    id:          'deal_closed',
    label:       'Deal closes',
    icon:        '🏁',
    category:    'Deals',
    description: 'Fires when a deal is marked Closed',
    config:      [],
  },
]

export const CONDITIONS = [
  { id: 'contact_status', label: 'Contact status is',         type: 'status_select' },
  { id: 'contact_source', label: 'Contact source is',         type: 'source_select' },
  { id: 'deal_stage',     label: 'Deal stage is',             type: 'stage_select'  },
  { id: 'deal_side',      label: 'Deal side is',              type: 'side_select'   },
  { id: 'agent_is',       label: 'Assigned agent is',         type: 'agent_select'  },
  { id: 'has_no_tasks',   label: 'Contact has no open tasks', type: 'boolean'       },
  { id: 'is_pre_approved',label: 'Contact is pre-approved',   type: 'boolean'       },
]

export const ACTIONS = [
  {
    id:     'create_task',
    label:  'Create a task',
    icon:   '✅',
    fields: [
      { key: 'title',    label: 'Task Title',    type: 'text',            required: true,  placeholder: 'Follow up with {{contact_name}}' },
      { key: 'priority', label: 'Priority',      type: 'priority_select', required: true,  default: 'normal' },
      { key: 'due_days', label: 'Due in (days)', type: 'number',          required: true,  default: 1 },
      { key: 'assign_to',label: 'Assign To',     type: 'agent_or_trigger',required: false, default: 'trigger_agent' },
      { key: 'notes',    label: 'Task Notes',    type: 'textarea',        required: false, placeholder: 'Auto-generated task' },
    ],
  },
  {
    id:     'send_notification',
    label:  'Send in-app notification',
    icon:   '🔔',
    fields: [
      { key: 'title',  label: 'Notification Title', type: 'text',     required: true,  placeholder: 'New lead assigned' },
      { key: 'body',   label: 'Message',            type: 'textarea', required: true,  placeholder: '{{contact_name}} has been added' },
      { key: 'notify', label: 'Notify',             type: 'agent_or_trigger', required: true, default: 'trigger_agent' },
    ],
  },
  {
    id:     'update_contact_status',
    label:  'Update contact status',
    icon:   '🔄',
    fields: [
      { key: 'status', label: 'Set Status To', type: 'status_select', required: true },
    ],
  },
  {
    id:     'update_deal_stage',
    label:  'Update deal stage',
    icon:   '📊',
    fields: [
      { key: 'stage', label: 'Set Stage To', type: 'stage_select', required: true },
    ],
  },
  {
    id:     'assign_agent',
    label:  'Assign to agent',
    icon:   '👤',
    fields: [
      { key: 'agent_id', label: 'Assign To Agent', type: 'agent_select', required: true },
    ],
  },
  {
    id:     'send_email',
    label:  'Send email notification',
    icon:   '📧',
    fields: [
      { key: 'to',      label: 'Send To',  type: 'agent_or_trigger', required: true,  default: 'trigger_agent' },
      { key: 'subject', label: 'Subject',  type: 'text',             required: true,  placeholder: 'Follow up needed: {{contact_name}}' },
      { key: 'body',    label: 'Message',  type: 'textarea',         required: true,  placeholder: 'This is an automated reminder' },
    ],
  },
  {
    id:     'add_tag',
    label:  'Add tag to contact',
    icon:   '🏷',
    fields: [
      { key: 'tag', label: 'Tag', type: 'text', required: true, placeholder: 'hot-lead' },
    ],
  },
]
