// ═══════════════════════════════════════════════════════════════
// TC Operations — Settings
// Everything the TC Board needs that a person might want to change
// lives here and is editable in the CRM (TC Board → ⚙️ TC Settings):
// photography services & prices, document statuses, readiness
// checklist, participant roles, and the per-phase task templates.
// Stored in system_settings under key 'tc_settings'. Anything not
// customized falls back to these defaults.
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabase'

export const DEFAULT_PHASE_TASKS = {
  pre_listing: [
    { key:'sign_listing_agreement', label:'Get listing agreement signed',        priority:'urgent', days:0  },
    { key:'schedule_photography',   label:'Schedule photography',                priority:'urgent', days:2,  cal:true, notify_agent:true },
    { key:'order_sign',             label:'Order yard sign',                     priority:'high',   days:3  },
    { key:'prepare_disclosures',    label:'Prepare disclosure documents',        priority:'high',   days:3  },
    { key:'floor_plan',             label:'Arrange floor plan / measurements',   priority:'normal', days:4  },
    { key:'mls_description',        label:'Prepare MLS listing description',     priority:'high',   days:5  },
    { key:'create_brochure',        label:'Create property brochure',            priority:'normal', days:5  },
    { key:'social_media_ads',       label:'Create social media ads',             priority:'high',   days:6  },
    { key:'install_lockbox',        label:'Install lockbox',                     priority:'high',   days:6  },
    { key:'showing_instructions',   label:'Set up showing instructions',         priority:'high',   days:6  },
    { key:'review_before_live',     label:'Final review before going live',      priority:'urgent', days:7  },
  ],
  active: [
    { key:'confirm_mls_live',       label:'Confirm listing is live on MLS',      priority:'urgent', days:0  },
    { key:'confirm_ads_running',    label:'Confirm ads are running',             priority:'high',   days:1  },
    { key:'schedule_open_house',    label:'Schedule first open house',           priority:'high',   days:3,  cal:true, notify_agent:true },
    { key:'followup_showings',      label:'Follow up with showing agents',       priority:'normal', days:7  },
    { key:'price_review',           label:'Price review with agent (2 weeks)',   priority:'normal', days:14, notify_agent:true },
  ],
  offer: [
    { key:'get_offer_signed',       label:'Get accepted offer signed by all parties', priority:'urgent', days:0 },
    { key:'notify_attorney',        label:'Notify attorney / title company',     priority:'urgent', days:0  },
    { key:'confirm_deposit',        label:'Confirm binder deposit received',     priority:'urgent', days:1  },
    { key:'confirm_buyer_attorney', label:'Confirm buyer attorney info',         priority:'high',   days:2  },
    { key:'confirm_seller_attorney',label:'Confirm seller attorney info',        priority:'high',   days:2  },
    { key:'send_contract_all',      label:'Send signed contract to all parties', priority:'urgent', days:2  },
    { key:'open_title_order',       label:'Open title / escrow order',          priority:'high',   days:3  },
  ],
  under_contract: [
    { key:'schedule_inspection',    label:'Schedule home inspection',            priority:'urgent', days:2,  cal:true, notify_agent:true },
    { key:'confirm_mortgage_app',   label:'Confirm buyer mortgage application',  priority:'urgent', days:3  },
    { key:'inspection_results',     label:'Follow up on inspection results',     priority:'urgent', days:7  },
    { key:'appraisal_ordered',      label:'Confirm appraisal ordered',          priority:'high',   days:7  },
    { key:'followup_mortgage',      label:'Follow up with mortgage broker',      priority:'high',   days:10, notify_agent:true },
    { key:'appraisal_result',       label:'Follow up on appraisal result',      priority:'high',   days:21 },
    { key:'conditional_approval',   label:'Confirm conditional loan approval',   priority:'urgent', days:25 },
    { key:'clear_to_close',         label:'Get clear to close confirmation',     priority:'urgent', days:30 },
    { key:'confirm_closing_date',   label:'Confirm closing date & time',        priority:'urgent', days:30, cal:true, notify_agent:true },
    { key:'schedule_walkthrough',   label:'Schedule final walkthrough',          priority:'high',   days:32, cal:true },
    { key:'prepare_closing_docs',   label:'Prepare closing documents',          priority:'urgent', days:33 },
    { key:'wire_instructions',      label:'Send wire instructions to buyer',     priority:'urgent', days:33 },
    { key:'review_hud',             label:'Review HUD / closing disclosure',    priority:'urgent', days:34 },
    { key:'confirm_keys',           label:'Confirm keys & access transfer',      priority:'high',   days:35 },
  ],
  closed: [
    { key:'confirm_commission',     label:'Confirm commission received',         priority:'urgent', days:0  },
    { key:'update_production',      label:'Update Production board as Closed',  priority:'urgent', days:0  },
    { key:'send_thank_you',         label:'Send thank you card to client',      priority:'high',   days:2  },
    { key:'closing_gift',           label:'Arrange closing gift',               priority:'high',   days:2  },
    { key:'request_review',         label:'Request Google review from client',  priority:'normal', days:7  },
    { key:'ask_referrals',          label:'Ask for referrals',                  priority:'normal', days:14 },
    { key:'archive_file',           label:'Archive transaction file',           priority:'normal', days:7  },
  ],
}

export const DEFAULT_TC_SETTINGS = {
  photo_services: [
    { id: 'photo',     label: 'Photography',     price: 350 },
    { id: 'drone',     label: 'Drone',           price: 75  },
    { id: 'floorplan', label: 'Floor plans',     price: 65  },
    { id: 'video',     label: 'Video',           price: 200 },
    { id: 'slideshow', label: 'Slideshow video', price: 75  },
  ],
  doc_statuses: ['Not Sent', 'Sent', 'Signed', 'Stuck'],
  readiness_checklist: [
    'House decluttered & clean',
    'All lights working',
    'Access / lockbox confirmed',
    'Exterior & landscaping ready',
    'Special shots list from agent',
  ],
  participant_roles: [
    'Seller', 'Buyer', "Buyer's Agent", 'Mortgage Broker',
    'Attorney (Seller)', 'Attorney (Buyer)', 'Photographer', 'Inspector',
  ],
  task_templates: DEFAULT_PHASE_TASKS,
  commission_rate_percent: 1.5,
}

let _cache = null
let _cacheAt = 0

// Merged settings: stored sections override defaults section-by-section.
export async function loadTcSettings(force = false) {
  if (!force && _cache && Date.now() - _cacheAt < 120000) return _cache
  let stored = {}
  try {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'tc_settings').maybeSingle()
    stored = data?.value || {}
  } catch { /* fall back to defaults */ }
  _cache = { ...DEFAULT_TC_SETTINGS, ...stored }
  _cacheAt = Date.now()
  return _cache
}

export async function saveTcSettings(settings) {
  _cache = { ...DEFAULT_TC_SETTINGS, ...settings }
  _cacheAt = Date.now()
  const { data: existing } = await supabase.from('system_settings').select('id').eq('key', 'tc_settings').maybeSingle()
  if (existing) {
    const { error } = await supabase.from('system_settings').update({ value: settings, updated_at: new Date().toISOString() }).eq('key', 'tc_settings')
    if (error) throw error
  } else {
    const { error } = await supabase.from('system_settings').insert({ key: 'tc_settings', value: settings, created_at: new Date().toISOString() })
    if (error) throw error
  }
}
