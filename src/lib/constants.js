// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Constants
// Sourced directly from Monday.com board data — exact labels,
// colors, and values as used by the team
// ═══════════════════════════════════════════════════════════════

// ── DEAL STAGES (Production Sheet → Stage column) ───────────────
export const DEAL_STAGES = [
  { value: 'Negotiations',      label: 'Negotiations',      hex: '#037f4c' },
  { value: 'Offer Accapted',    label: 'Offer Accapted',    hex: '#00c875' }, // intentional spelling
  { value: 'Under Shtar',       label: 'Under Shtar',       hex: '#bb3354' },
  { value: 'Under Contract',    label: 'Under Contract',    hex: '#757575' },
  { value: 'Closed',            label: 'Closed',            hex: '#225091' },
  { value: 'Deal Fell Through', label: 'Deal Fell Through', hex: '#ff007f' },
]

// ── CONTRACT TO CLOSE STAGES ────────────────────────────────────
export const CTC_STAGES = [
  { value: 'Inspection scheduled', label: 'Inspection scheduled', hex: '#007eb5' },
  { value: 'Mortgage process',     label: 'Mortgage process',     hex: '#9d50dd' },
  { value: 'Appraisal ordered',    label: 'Appraisal ordered',    hex: '#579bfc' },
  { value: 'Conditional Approval', label: 'Conditional Approval', hex: '#cab641' },
  { value: 'Clear to close',       label: 'Clear to close',       hex: '#00c875' },
  { value: 'Closing scheduled',    label: 'Closing scheduled',    hex: '#ffcb00' },
  { value: 'Closed',               label: 'Closed',               hex: '#037f4c' },
  { value: 'Issue',                label: 'Issue',                hex: '#fdab3d' },
  { value: 'Canceled',             label: 'Canceled',             hex: '#df2f4a' },
]

// ── DEAL SIDES ──────────────────────────────────────────────────
export const DEAL_SIDES = [
  'Buyer', 'Seller', 'Listing', 'Dual', 'Dual Buyer', 'Dual Listing', 'Rental', 'Flip'
]

// ── DEAL STATUS (CTC column) ────────────────────────────────────
export const DEAL_STATUSES = [
  { value: 'UC',       label: 'UC',       hex: '#9aadbd' },
  { value: 'Financing', label: 'Financing', hex: '#00c875' },
  { value: 'Clear to Close', label: 'Clear to Close', hex: '#ffcb00' },
  { value: 'Closed',   label: 'Closed',   hex: '#007eb5' },
  { value: 'AO',       label: 'AO',       hex: '#9d50dd' },
]

// ── SALE TYPES ──────────────────────────────────────────────────
export const SALE_TYPES = ["On Market", "Off Market", 'FSBO']

// ── PROPERTY TYPES ──────────────────────────────────────────────
export const PROPERTY_TYPES = [
  'Multi Family', 'Single Family', 'Condo', 'Land', 'Commercial',
  'New Construction', 'Summer Home', 'Co-Op'
]

// ── BUYER TYPES ─────────────────────────────────────────────────
export const BUYER_TYPES = ['Developer', 'Investor', 'Home Owner', 'Summer Home']

// ── SALES SOURCES (exact from Monday.com) ───────────────────────
export const SALES_SOURCES = [
  'Farm - Open House', 'Social Media', 'Past Client Referrals', 'Met (Farm)- Referral',
  'Sign Call', 'BuildingFarm', 'Israel', 'Met Farm', 'Zillow', 'Pest Client Referral',
  'Repeat', 'Referral - Farm', 'Sign', 'Office Referral', 'Past Client Repeat', 'SOI',
  'Farm', 'Met', 'Lazer referal', 'System Call', 'Called Agent', 'Referral',
  'Approached', 'Cold Calls', 'own investment', 'Called for listing agent'
]

// ── COMMAND STATUSES ────────────────────────────────────────────
export const COMMAND_STATUSES = [
  { value: '',                          label: '',                          hex: '#c4c4c4' },
  { value: 'Contact Info needed',       label: 'Contact Info needed',       hex: '#ff5ac4' },
  { value: 'Working on it',             label: 'Working on it',             hex: '#fdab3d' },
  { value: 'Waiting for approval',      label: 'Waiting for approval',      hex: '#007eb5' },
  { value: 'Sent not signd',            label: 'Sent not signd',            hex: '#ff6d3b' },
  { value: 'Done',                      label: 'Done',                      hex: '#00c875' },
  { value: 'Sent - Watting for lead',   label: 'Sent - Waiting for lead',   hex: '#ffcb00' },
  { value: 'Stuck',                     label: 'Stuck',                     hex: '#df2f4a' },
  { value: 'No command',                label: 'No command',                hex: '#9d50dd' },
  { value: 'Waiting',                   label: 'Waiting',                   hex: '#bb3354' },
  { value: 'Doesn\'t Want To Sign',     label: "Doesn't Want To Sign",      hex: '#ff007f' },
  { value: 'Client has been notified',  label: 'Client notified to sign',   hex: '#784bd1' },
  { value: 'Not Yet',                   label: 'Not Yet',                   hex: '#cab641' },
  { value: 'Lazer gets the commission', label: 'Lazer gets commission',     hex: '#9cd326' },
  { value: 'Reminder to sign 1',        label: 'Reminder to sign 1',       hex: '#7f5347' },
  { value: 'Reminder to sign 2',        label: 'Reminder to sign 2',       hex: '#563e3e' },
  { value: 'Reminder to sign 3',        label: 'Reminder to sign 3',       hex: '#333333' },
]

// ── SIGN STATUSES ───────────────────────────────────────────────
export const SIGN_STATUSES = [
  { value: 'Sold Sign Sent',           label: 'Sold Sign Sent',           hex: '#00c875' },
  { value: 'Under Contract Sent',      label: 'Under Contract Sent',      hex: '#007eb5' },
]

// ── COMMISSION STATUSES ─────────────────────────────────────────
export const COMMISSION_STATUSES = [
  { value: 'Working on it', label: 'Working on it', hex: '#fdab3d' },
  { value: 'Done',          label: 'Done',          hex: '#00c875' },
  { value: 'Stuck',         label: 'Stuck',         hex: '#df2f4a' },
]

// ── AGENT COMMISSION STATUSES ────────────────────────────────────
export const AGENT_COMMISSION_STATUSES = [
  { value: 'Working on it', label: 'Working on it', hex: '#fdab3d' },
  { value: 'Done',          label: 'Done',          hex: '#00c875' },
  { value: 'Not Yet',       label: 'Not Yet',       hex: '#df2f4a' },
]

// ── GIFT STATUSES (UC Gift Sheet) ───────────────────────────────
export const GIFT_STATUSES = [
  { value: 'Couldn\'t Deliver', label: "Couldn't Deliver", hex: '#df2f4a' },
  { value: 'Shipped out',       label: 'Shipped out',      hex: '#563e3e' },
  { value: 'Please deliver',    label: 'Please deliver',   hex: '#c4c4c4' },
  { value: 'Under Contract',    label: 'Under Contract',   hex: '#9d50dd' },
  { value: 'Too Late',          label: 'Too Late',         hex: '#e484bd' },
  { value: 'Don\'t send',       label: "Don't send",       hex: '#037f4c' },
  { value: 'Check Note',        label: 'Check Note',       hex: '#579bfc' },
  { value: 'Delivered',         label: 'Delivered',        hex: '#00c875' },
]

// ── GIFT LABELS ─────────────────────────────────────────────────
export const GIFT_LABELS = [
  { value: 'Home Owner', label: 'Home Owner', hex: '#9aadbd' },
  { value: 'Investor',   label: 'Investor',   hex: '#007eb5' },
  { value: 'Seller',     label: 'Seller',     hex: '#9d99b9' },
]

// ── CLOSING GIFT STATUSES ────────────────────────────────────────
export const CLOSING_GIFT_STATUSES = [
  { value: 'sent',          label: 'Sent',          hex: '#00c875' },
  { value: 'Order Created', label: 'Order Created', hex: '#fdab3d' },
  { value: 'Not Sending',   label: 'Not Sending',   hex: '#df2f4a' },
]

// ── OFFER SIDES ─────────────────────────────────────────────────
export const OFFER_SIDES = [
  { value: 'Buyer',   label: 'Buyer',   hex: '#cd9282' },
  { value: 'Listing', label: 'Listing', hex: '#fdab3d' },
]

// ── OFFER STATUSES ───────────────────────────────────────────────
export const OFFER_STATUSES = [
  { value: 'Sent',         label: 'Sent',         hex: '#fdab3d' },
  { value: 'AO',           label: 'AO',           hex: '#00c875' },
  { value: 'Stuck',        label: 'Stuck',        hex: '#df2f4a' },
  { value: 'Fell through', label: 'Fell through', hex: '#007eb5' },
]

// ── LISTING STATUSES ─────────────────────────────────────────────
export const LISTING_STATUSES = [
  { value: 'Active',              label: 'Active',              hex: '#00c875' },
  { value: 'Off Market',          label: 'Off Market',          hex: '#fdab3d' },
  { value: 'Accepted offer',      label: 'Accepted Offer',      hex: '#784bd1' },
  { value: 'Under Contract',      label: 'Under Contract',      hex: '#007eb5' },
  { value: 'Expired',             label: 'Expired',             hex: '#df2f4a' },
  { value: 'Sold',                label: 'Sold',                hex: '#ffcb00' },
  { value: 'incomplete',          label: 'Incomplete',          hex: '#c4c4c4' },
  { value: 'Temporary off market',label: 'Temp Off Market',     hex: '#579bfc' },
  { value: 'Seller not selling',  label: 'Seller Not Selling',  hex: '#333333' },
]

// ── LISTING PROPERTY TYPES ───────────────────────────────────────
export const LISTING_PROPERTY_TYPES = [
  'New Construction', 'Land', 'Single Family', 'Condo', 'Commercial',
  'Duplex', '2 Family', '3 Family', '4 Family', 'High Ranch', 'Ranch'
]

// ── LISTING DEAL TYPES ───────────────────────────────────────────
export const LISTING_DEAL_TYPES = ['MLS', 'Off Market']

// ── CONTACT STATUSES ─────────────────────────────────────────────
export const CONTACT_TYPES = ['Buyer', 'Seller', 'Client', 'Agent', 'Attorney', 'Mortgage Broker', 'Photographer', 'Appraiser', 'Inspector', 'Title Company', 'Vendor', 'Other']

// Badge colors so a contact's ROLE is visible at a glance everywhere
export const CONTACT_TYPE_COLORS = {
  'Buyer': '#0EA5E9', 'Seller': '#F97316', 'Client': '#10B981', 'Agent': '#1B2B4B',
  'Attorney': '#8B5CF6', 'Mortgage Broker': '#B45309', 'Photographer': '#EC4899',
  'Appraiser': '#0891B2', 'Inspector': '#65A30D', 'Title Company': '#6B7280',
  'Vendor': '#78716C', 'Other': '#94A3B8',
}

export const CONTACT_STATUSES = [
  { value: 'New',              label: 'New',              color: '#0EA5E9' },
  { value: 'Hot',              label: 'Hot',              color: '#DC2626' },
  { value: 'Warm',             label: 'Warm',             color: '#F97316' },
  { value: 'Cold',             label: 'Cold',             color: '#94A3B8' },
  { value: 'Active',           label: 'Active',           color: '#10B981' },
  { value: 'Nurturing',        label: 'Nurturing',        color: '#8B5CF6' },
  { value: 'Under Contract',   label: 'Under Contract',   color: '#F5A623' },
  { value: 'Closed',           label: 'Closed',           color: '#225091' },
  { value: 'Unresponsive',     label: 'Unresponsive',     color: '#6B7280' },
]

// ── CONTACT SOURCES ──────────────────────────────────────────────
export const CONTACT_SOURCES = [
  'Voice Capture', 'Open House', 'Sign Call', 'Referral', 'Social Media',
  'Zillow', 'Cold Call', 'Farm', 'SOI', 'Past Client', 'Office Referral',
  'Website', 'Text', 'Walk In', 'Other'
]

// ── TASK PRIORITIES ──────────────────────────────────────────────
export const TASK_PRIORITIES = [
  { value: 'urgent', label: 'Urgent', color: '#DC2626' },
  { value: 'high',   label: 'High',   color: '#F97316' },
  { value: 'normal', label: 'Normal', color: '#3B82F6' },
  { value: 'low',    label: 'Low',    color: '#94A3B8' },
]

// ── TASK STATUSES ────────────────────────────────────────────────
export const TASK_STATUSES = [
  { value: 'pending',     label: 'Pending',     color: '#F97316' },
  { value: 'in_progress', label: 'In Progress', color: '#3B82F6' },
  { value: 'done',        label: 'Done',        color: '#10B981' },
  { value: 'cancelled',   label: 'Cancelled',   color: '#94A3B8' },
]

// ── CLOSING COMMISSION STATUSES ──────────────────────────────────
export const CLOSING_COMMISSION_STATUSES = [
  { value: 'Delivered',      label: 'Delivered',      hex: '#fdab3d' },
  { value: 'Done',           label: 'Done',           hex: '#00c875' },
  { value: 'Delayed',        label: 'Delayed',        hex: '#df2f4a' },
  { value: 'Ready for pick up', label: 'Ready for pick up', hex: '#007eb5' },
  { value: 'Closed',         label: 'Closed',         hex: '#9d50dd' },
  { value: 'UC',             label: 'UC',             hex: '#ff7575' },
]

// ── REFERRAL AGENTS ──────────────────────────────────────────────
export const REFERRAL_AGENTS = [
  'None', 'Mendy', 'Felsen', 'Moshe', 'Simcha', 'Zanvi', 'Isaac',
  'Lazer', 'Elli', 'Agent', 'Other',
  '25% for Isaac', '10% for Isaac', 'Lazer - Simcha', 'Simcha - Lazer'
]

// ── INTEREST LEVELS ──────────────────────────────────────────────
export const INTEREST_LEVELS = ['Hot', 'Warm', 'Cold', 'Just Looking']

// ── AGENT ANNUAL GCI GOAL ────────────────────────────────────────
export const AGENT_GOAL_GCI = 250000
export const TEAM_GOAL_GCI  = 2000000
export const TEAM_GOAL_DEALS = 200

// ── LISTING PREP DEFAULT CHECKLIST ───────────────────────────────
export const DEFAULT_PREP_CHECKLIST = [
  { id: 'sign',        label: 'Sign ordered',          done: false },
  { id: 'photos',      label: 'Photos scheduled',      done: false },
  { id: 'mls',         label: 'MLS listed',            done: false },
  { id: 'floorplan',   label: 'Floor plan done',       done: false },
  { id: 'brochure',    label: 'Brochure created',      done: false },
  { id: 'ads',         label: 'Ads running',           done: false },
  { id: 'showing',     label: 'Showing instructions',  done: false },
  { id: 'disclosure',  label: 'Disclosure sent',       done: false },
  { id: 'lockbox',     label: 'Lockbox installed',     done: false },
  { id: 'openhouse',   label: 'Open house scheduled',  done: false },
]

// ── ANNOUNCEMENT TYPES ───────────────────────────────────────────
export const ANNOUNCEMENT_TYPES = [
  { value: 'info',    label: 'Info',    color: '#3B82F6' },
  { value: 'alert',   label: 'Alert',   color: '#DC2626' },
  { value: 'success', label: 'Success', color: '#10B981' },
  { value: 'deal',    label: 'Deal',    color: '#F5A623' },
]

// ── DAILY BRIEFING SECTIONS ──────────────────────────────────────
export const BRIEFING_SECTIONS = [
  { id: 'tasks',        label: "Today's Tasks" },
  { id: 'deals',        label: 'Active Deals' },
  { id: 'listings',     label: 'Active Listings' },
  { id: 'contacts',     label: 'New Leads' },
  { id: 'closings',     label: 'Upcoming Closings' },
  { id: 'announcements',label: 'Announcements' },
]

// ── OPEN HOUSE INTEREST LEVELS ───────────────────────────────────
export const OH_INTEREST_LEVELS = ['Hot', 'Warm', 'Cold', 'Just Looking']

// ── ROCKLAND COUNTY NY CITIES / NEIGHBORHOODS ────────────────────
export const LOCAL_CITIES = [
  'Monsey', 'Spring Valley', 'New City', 'Suffern', 'Nanuet', 'West Nyack',
  'Blauvelt', 'Chestnut Ridge', 'Wesley Hills', 'Pomona', 'Airmont',
  'Sloatsburg', 'Tuxedo', 'Monroe', 'Kiryas Joel', 'Garnerville',
  'Haverstraw', 'West Haverstraw', 'Stony Point', 'Nyack', 'Piermont',
  'Pearl River', 'Orangeburg', 'Tappan', 'Sparkill', 'Viola',
  'Tallman', 'Hillburn', 'Ladentown', 'Thiells', 'Mountain View'
]
