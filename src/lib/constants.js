/* ═══════════════════════════════════════════════════════════════
   TargetOS V2 — Constants
   Sourced directly from Monday.com board data
   ═══════════════════════════════════════════════════════════════ */

// ── TEAM ─────────────────────────────────────────────────────────
export const AGENTS = [
  { name: 'Lazer Farkas',       email: 'lazer@targetreteam.com',    color: '#CC2200', role: 'agent'     },
  { name: 'Mendy Jankovits',    email: 'mendy@targetreteam.com',    color: '#0EA5E9', role: 'agent'     },
  { name: 'Isaac Leibowitz',    email: 'isaac@targetreteam.com',    color: '#F5A623', role: 'agent'     },
  { name: 'Yanky Lichtenstein', email: 'yanky@targetreteam.com',    color: '#10B981', role: 'admin'     },
  { name: 'Gitty Fogel',        email: 'office@targetreteam.com',   color: '#7C3AED', role: 'secretary' },
  { name: 'Joel Rottenstein',   email: 'joel@targetreteam.com',     color: '#E8650A', role: 'agent'     },
  { name: 'Eli Hoffman',        email: 'eli@targetreteam.com',      color: '#14B8A6', role: 'agent'     },
  { name: 'Avraham Weinberger', email: 'avraham@targetreteam.com',  color: '#8B5CF6', role: 'admin'     },
]

export const AGENT_GOALS = {
  'Lazer Farkas':       { gci: 300000, deals: 30 },
  'Mendy Jankovits':    { gci: 250000, deals: 25 },
  'Isaac Leibowitz':    { gci: 200000, deals: 20 },
  'Yanky Lichtenstein': { gci: 200000, deals: 20 },
  'Gitty Fogel':        { gci: 80000,  deals: 8  },
  'Joel Rottenstein':   { gci: 150000, deals: 15 },
  'Eli Hoffman':        { gci: 200000, deals: 20 },
  'Avraham Weinberger': { gci: 200000, deals: 20 },
}

export const TEAM_GOAL = { gci: 2000000, deals: 200 }

// ── PRODUCTION BOARD (from Monday.com board 2032924987) ──────────
// Groups
export const DEAL_GROUPS = [
  { id: 'negotiations',  label: 'Negotiations',   color: '#037f4c' },
  { id: 'offer_accepted',label: 'Offer Accapted',  color: '#00c875' },
  { id: 'under_shtar',   label: 'Under Shtar',    color: '#bb3354' },
  { id: 'under_contract',label: 'Under Contract',  color: '#757575' },
  { id: 'closed',        label: 'Closed',          color: '#225091' },
  { id: 'fell_through',  label: 'Deal Fell Through',color: '#ff007f' },
]

// Stage statuses (from Monday Stage column)
export const DEAL_STAGES = [
  { id: 'Negotiations',     label: 'Negotiations',      color: '#037f4c' },
  { id: 'Offer Accapted',   label: 'Offer Accapted',    color: '#00c875' },
  { id: 'Under Shtar',      label: 'Under Shtar',       color: '#bb3354' },
  { id: 'Under Contract',   label: 'Under Contract',    color: '#757575' },
  { id: 'Closed',           label: 'Closed',            color: '#225091' },
  { id: 'Deal Fell Through', label: 'Deal Fell Through', color: '#ff007f' },
]

// Active pipeline stages (not closed/fell)
export const PIPELINE_STAGES = ['Negotiations', 'Offer Accapted', 'Under Shtar', 'Under Contract']

// Contract to Close stages (from Monday CTC column)
export const CTC_STAGES = [
  { id: 'Inspection scheduled', label: 'Inspection scheduled', color: '#007eb5' },
  { id: 'Mortgage process',     label: 'Mortgage process',     color: '#9d50dd' },
  { id: 'Appraisal ordered',    label: 'Appraisal ordered',    color: '#579bfc' },
  { id: 'Conditional Approval', label: 'Conditional Approval', color: '#cab641' },
  { id: 'Clear to close',       label: 'Clear to close',       color: '#00c875' },
  { id: 'Closing scheduled',    label: 'Closing scheduled',    color: '#ffcb00' },
  { id: 'Closed',               label: 'Closed',               color: '#037f4c' },
  { id: 'Canceled',             label: 'Canceled',             color: '#df2f4a' },
  { id: 'Issue',                label: 'Issue',                color: '#fdab3d' },
]

// Side options (from Monday Side column)
export const DEAL_SIDES = [
  { id: 'Buyer',       label: 'Buyer',        color: '#bca58a' },
  { id: 'Listing',     label: 'Listing',      color: '#fdab3d' },
  { id: 'Dual',        label: 'Dual',         color: '#00c875' },
  { id: 'Dual Buyer',  label: 'Dual Buyer',   color: '#cd9282' },
  { id: 'Dual Listing',label: 'Dual Listing', color: '#ffcb00' },
  { id: 'Seller',      label: 'Seller',       color: '#9d50dd' },
  { id: 'Rental',      label: 'Rental',       color: '#c4c4c4' },
  { id: 'Flip',        label: 'Flip',         color: '#cab641' },
]

// Sale Type (from Monday label column)
export const SALE_TYPES = ['On Market', 'Off Market', 'FSBO']

// Property Types (from Monday dropdown1)
export const PROPERTY_TYPES = [
  'Single Family', 'Multi Family', 'Condo', 'Co-Op',
  'Land', 'Commercial', 'New Construction', 'Summer Home',
]

// Sales Sources (from Monday label1 column — all values preserved)
export const SALES_SOURCES = [
  'SOI', 'Past Client Repeat', 'Past Client Referral', 'Past Client Referrals',
  'Sign Call', 'Sign', 'Cold Calls', 'Farm', 'Farm - Open House',
  'Met (Farm) Referral', 'Met Farm', 'BuildingFarm', 'Referral - Farm',
  'Office Referral', 'Referral', 'Lazer referal', 'Social Media',
  'Zillow', 'Israel', 'Called Agent', 'Called for listing agent',
  'System Call', 'Approached', 'Repeat', 'own investment', 'Other',
]

// Command statuses (from Monday status04)
export const COMMAND_STATUSES = [
  { id: 'Working on it',             color: '#fdab3d' },
  { id: 'Done',                      color: '#00c875' },
  { id: 'Stuck',                     color: '#df2f4a' },
  { id: 'Waiting for approval',      color: '#007eb5' },
  { id: 'No command',                color: '#9d50dd' },
  { id: 'Contact Info needed',       color: '#ff5ac4' },
  { id: 'Reminder to sign 1',        color: '#7f5347' },
  { id: 'Reminder to sign 2',        color: '#563e3e' },
  { id: 'Reminder to sign 3',        color: '#333333' },
  { id: 'Sent - Waiting for lead',   color: '#ffcb00' },
  { id: 'Waiting',                   color: '#bb3354' },
  { id: 'Doesn\'t Want To Sign',     color: '#ff007f' },
  { id: 'Client has been notified',  color: '#784bd1' },
  { id: 'Not Yet',                   color: '#cab641' },
  { id: 'Lazer gets commission',     color: '#9cd326' },
  { id: 'Sent not signed',           color: '#ff6d3b' },
]

// Commission Received
export const COMMISSION_STATUS = [
  { id: 'Working on it', color: '#fdab3d' },
  { id: 'Done',          color: '#00c875' },
  { id: 'Stuck',         color: '#df2f4a' },
]

// Agent Commission Sent
export const AGENT_COMMISSION_STATUS = [
  { id: 'Working on it', color: '#fdab3d' },
  { id: 'Done',          color: '#00c875' },
  { id: 'Not Yet',       color: '#df2f4a' },
]

// Sign statuses (from Monday label3)
export const SIGN_STATUSES = [
  { id: 'Under Contract Sent', color: '#007eb5' },
  { id: 'Sold Sign Sent',      color: '#00c875' },
]

// ── GIFT SHEET (from Monday.com board 2359491602) ────────────────
export const GIFT_STATUSES = [
  { id: 'Shipped out',      color: '#563e3e' },
  { id: 'Delivered',        color: '#00c875' },
  { id: "Couldn't Deliver", color: '#df2f4a' },
  { id: 'Too Late',         color: '#e484bd' },
  { id: 'Under Contract',   color: '#9d50dd' },
  { id: 'Please deliver',   color: '#c4c4c4' },
  { id: "Don't send",       color: '#037f4c' },
  { id: 'Check Note',       color: '#579bfc' },
]

export const GIFT_LABELS = [
  { id: 'Home Owner', color: '#9aadbd' },
  { id: 'Investor',   color: '#007eb5' },
  { id: 'Seller',     color: '#9d99b9' },
]

export const GIFT_TYPES = ['Under Contract', 'Closing']

// ── CONTACTS ─────────────────────────────────────────────────────
export const CONTACT_STATUSES = [
  { id: 'New',             color: '#0EA5E9' },
  { id: 'Hot',             color: '#DC2626' },
  { id: 'Warm',            color: '#D97706' },
  { id: 'Cold',            color: '#94A3B8' },
  { id: 'Active',          color: '#16A34A' },
  { id: 'Nurturing',       color: '#7C3AED' },
  { id: 'Under Contract',  color: '#757575' },
  { id: 'Closed',          color: '#225091' },
  { id: 'Unresponsive',    color: '#6B7280' },
]

export const CONTACT_SOURCES = [
  'SOI', 'Referral', 'Past Client', 'Sign Call', 'Open House',
  'Zillow', 'Cold Call', 'Social Media', 'Farm', 'Voice Capture', 'Other',
]

export const CONTACT_TYPES = ['Buyer', 'Seller', 'Investor', 'Renter', 'Landlord', 'Other']

// ── TASKS ─────────────────────────────────────────────────────────
export const TASK_PRIORITIES = [
  { id: 'urgent', label: '🔴 Urgent', color: '#DC2626' },
  { id: 'high',   label: '🟠 High',   color: '#D97706' },
  { id: 'normal', label: '🔵 Normal', color: '#0EA5E9' },
  { id: 'low',    label: '⚪ Low',    color: '#94A3B8' },
  { id: 'note',   label: '📌 Note',   color: '#7C3AED' },
]

export const TASK_STATUSES = [
  { id: 'pending',   label: 'Pending'   },
  { id: 'done',      label: 'Done'      },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'pinned',    label: 'Pinned'    },
]

// ── LISTINGS ──────────────────────────────────────────────────────
export const LISTING_STATUSES = [
  { id: 'Active',            color: '#16A34A' },
  { id: 'Under Contract',    color: '#757575' },
  { id: 'Sold',              color: '#225091' },
  { id: 'Expired',           color: '#DC2626' },
  { id: 'Withdrawn',         color: '#94A3B8' },
  { id: 'Coming Soon',       color: '#D97706' },
  { id: 'Off Market',        color: '#6B7280' },
]

export const LISTING_DEAL_TYPES = ['MLS', 'Off Market', 'FSBO', 'New Construction', 'Auction']

// ── CALLS ─────────────────────────────────────────────────────────
export const CALL_OUTCOMES = [
  { id: 'Answered',            color: '#16A34A' },
  { id: 'Voicemail',           color: '#0EA5E9' },
  { id: 'No Answer',           color: '#94A3B8' },
  { id: 'Wrong Number',        color: '#DC2626' },
  { id: 'Callback Scheduled',  color: '#D97706' },
  { id: 'Disconnected',        color: '#6B7280' },
]

// ── CALENDAR ──────────────────────────────────────────────────────
export const EVENT_TYPES = [
  { id: 'showing',    label: 'Showing',      color: '#0EA5E9' },
  { id: 'open house', label: 'Open House',   color: '#D97706' },
  { id: 'closing',    label: 'Closing',      color: '#16A34A' },
  { id: 'inspection', label: 'Inspection',   color: '#7C3AED' },
  { id: 'appointment',label: 'Appointment',  color: '#CC2200' },
  { id: 'meeting',    label: 'Meeting',      color: '#E8650A' },
  { id: 'call',       label: 'Call',         color: '#14B8A6' },
  { id: 'personal',   label: 'Personal',     color: '#8B5CF6' },
  { id: 'other',      label: 'Other',        color: '#94A3B8' },
]

// ── OPEN HOUSE ────────────────────────────────────────────────────
export const INTEREST_LEVELS = [
  { id: 'Hot',  color: '#DC2626' },
  { id: 'Warm', color: '#D97706' },
  { id: 'Cold', color: '#94A3B8' },
]

// ── ANNOUNCEMENTS ─────────────────────────────────────────────────
export const ANNOUNCEMENT_TYPES = [
  { id: 'info',        icon: '📢', color: '#0EA5E9' },
  { id: 'success',     icon: '✅', color: '#16A34A' },
  { id: 'warning',     icon: '⚠️', color: '#D97706' },
  { id: 'celebration', icon: '🎉', color: '#CC2200' },
  { id: 'urgent',      icon: '🚨', color: '#DC2626' },
]

// ── MARKET HEADLINES ──────────────────────────────────────────────
export const HEADLINES = [
  '📈 Rockland County median home price up 8% year over year — seller market continues',
  '🏠 Inventory remains historically tight — now is the time to list',
  '💰 Mortgage rates holding steady at 6.8% this week — buyers adjusting expectations',
  '🔥 Spring market in full swing — buyer demand strongest since 2022',
  '📋 HGAR MLS new rules effective July 1, 2026 — review before listing',
  '🏡 New Construction permits up 12% in Rockland — watch the Pomona corridor',
  '💼 1031 exchange deadline rules updated — consult your attorney',
]

// ── LISTING PREP CHECKLIST (default items) ────────────────────────
export const DEFAULT_PREP_CHECKLIST = [
  { label: 'Signed listing agreement',           category: 'Legal',      done: false },
  { label: 'Seller disclosure completed',        category: 'Legal',      done: false },
  { label: 'Lead paint disclosure (pre-1978)',   category: 'Legal',      done: false },
  { label: 'Attorney info collected',            category: 'Legal',      done: false },
  { label: 'Professional photos scheduled',      category: 'Marketing',  done: false },
  { label: 'Professional photos received',       category: 'Marketing',  done: false },
  { label: 'Floor plan created',                 category: 'Marketing',  done: false },
  { label: 'Brochure/flyer designed',            category: 'Marketing',  done: false },
  { label: 'Social media post created',          category: 'Marketing',  done: false },
  { label: 'Listed on MLS',                      category: 'Listing',    done: false },
  { label: 'Lock box installed',                 category: 'Listing',    done: false },
  { label: 'For Sale sign installed',            category: 'Listing',    done: false },
  { label: 'Showing instructions set',           category: 'Listing',    done: false },
  { label: 'Buyers agent % confirmed',           category: 'Listing',    done: false },
  { label: 'Open house scheduled',               category: 'Open House', done: false },
  { label: 'Open house advertised online',       category: 'Open House', done: false },
  { label: 'Open house signs ordered',           category: 'Open House', done: false },
  { label: 'Seller briefed on process',          category: 'Seller',     done: false },
  { label: 'Seller preferred showing times set', category: 'Seller',     done: false },
]
