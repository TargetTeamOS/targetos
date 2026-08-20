// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Constants
// Sourced directly from Monday.com board data — exact labels,
// colors, and values as used by the team
// ═══════════════════════════════════════════════════════════════

import { choiceStorageOptions, workflowStorageOptions } from './identifiers'

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
export const CTC_STAGES = workflowStorageOptions('deal.ctc')

// ── DEAL SIDES ──────────────────────────────────────────────────
export const DEAL_SIDES = [
  'Buyer', 'Seller', 'Listing', 'Dual', 'Dual Buyer', 'Dual Listing', 'Rental', 'Flip'
]

// ── DEAL STATUS (CTC column) ────────────────────────────────────
export const DEAL_STATUSES = workflowStorageOptions('deal.progress')

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
export const COMMAND_STATUSES = [{ value: '', label: '', hex: '#c4c4c4' }, ...workflowStorageOptions('command.lifecycle')]

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

export const COMMISSION_COLLECTION_STATUSES = workflowStorageOptions('commission.collection')

// ── GIFT STATUSES (UC Gift Sheet) ───────────────────────────────
export const GIFT_STATUSES = workflowStorageOptions('gift.lifecycle')

// ── GIFT LABELS ─────────────────────────────────────────────────
export const GIFT_LABELS = choiceStorageOptions('gift.recipient_type')

// ── CLOSING GIFT STATUSES ────────────────────────────────────────
export const CLOSING_GIFT_STATUSES = workflowStorageOptions('gift.closing')

// ── OFFER SIDES ─────────────────────────────────────────────────
export const OFFER_SIDES = [
  { value: 'Buyer',   label: 'Buyer',   hex: '#cd9282' },
  { value: 'Listing', label: 'Listing', hex: '#fdab3d' },
]

// ── OFFER STATUSES ───────────────────────────────────────────────
// Canonical going forward: Draft, Sent, Negotiating, Accepted, Rejected,
// Withdrawn, Expired. Legacy values (AO, Stuck, Fell through) are NOT
// renamed in the database — that would rewrite history without an
// explicit migration, which the spec explicitly forbids. Instead every
// place that checks status treats the old and new vocabulary as
// equivalent (see OFFER_ACCEPTED_VALUES / OFFER_PENDING_VALUES below):
// AO ~= Accepted, Stuck ~= Negotiating, Fell through ~= Rejected (the
// closest single legacy bucket — historical rows never distinguished
// Rejected from Withdrawn from Expired, so this is a best-effort
// display mapping, not a claim that every old "Fell through" row was
// specifically a rejection).
export const OFFER_STATUSES = [
  { value: 'Draft',       label: 'Draft — not sent yet',             hex: '#94A3B8' },
  { value: 'Sent',        label: 'Sent — awaiting response',         hex: '#fdab3d' },
  { value: 'Negotiating', label: 'Negotiating — counters/revisions', hex: '#df2f4a' },
  { value: 'Accepted',    label: 'Accepted',                         hex: '#00c875' },
  { value: 'Rejected',    label: 'Rejected',                         hex: '#DC2626' },
  { value: 'Withdrawn',   label: 'Withdrawn',                        hex: '#6B7280' },
  { value: 'Expired',     label: 'Expired',                          hex: '#78716C' },
]

// Every place in the app that needs to ask "is this offer accepted?" or
// "is this offer still pending?" should use these, not a hand-rolled
// array literal, so the legacy/new mapping only has to be right in ONE
// place.
export const OFFER_ACCEPTED_VALUES = ['AO', 'Accepted', 'Closed']
export const OFFER_PENDING_VALUES  = ['Sent', 'Negotiating', 'Stuck']
export const OFFER_CLOSED_LOST_VALUES = ['Fell through', 'Rejected', 'Withdrawn', 'Expired']

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
