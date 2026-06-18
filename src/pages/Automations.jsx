import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Btn, Modal, ModalTitle, Input, Select, Grid2 } from '../components/UI'
import { useApp } from '../context/AppContext'
import { useConfirm } from '../components/ConfirmDialog'

// ── REAL DATA FROM MONDAY.COM BOARDS ──────────────────────────
const LISTING_STATUSES = ['Active','Accepted offer','Under Contract','Off Market','Expired','Temporary off market','Sold','Seller not selling','incomplete']
const LISTING_TYPES    = ['New Construction','Land','Single Family','Condo','Commercial','Duplex','2 Family','3 Family','4 Family','High Ranch','Ranch']
const LISTING_GROUPS   = ['Active Listings','Under Contract','Expired','Listings takin 2025','Sold 2025','Seller not selling','Sold 2026','Sold 2024','Temporary off market']

const DEAL_STAGES      = ['Offer Accapted','Under Shtar','Under Contract','Closed','Deal Fell Through','Negotiations']
const DEAL_GROUPS      = ['ACCEPTED OFFERS','Under Shtar','UNDER CONTRACT','Sold - 2026','Deal Fell through - 2026','Sold - 2025']
const DEAL_SIDES       = ['Buyer','Dual','Dual Buyer','Dual Listing','Listing','Seller','Rental','Flip']
const DEAL_CTC         = ['Inspection scheduled','Mortgage process','Appraisal ordered','Conditional Approval','Clear to close','Closing scheduled','Closed','Issue','Canceled']
const DEAL_SALE_TYPES  = ['On Market','Off Market','FSB"O']
const DEAL_SOURCES     = ['Called Agent','Approached','Past Client Referral','System Call','Office Referral','Past Client Repeat','Farm','Met','Social Media','Sign Call','Cold Calls','SOI','Zillow','Referral','BuildingFarm','Israel']
const COMMISSION_STATUS= ['Working on it','Done','Stuck']
const SIGN_STATUS      = ['Under Contract Sent','Sold Sign Sent']

const AGENTS = ['Lazer Farkas','Mendy Jankovits','Isaac Leibowitz','Yanky Lichtenstein','Gitty Fogel','Joel Rottenstein','Eli Hoffman','Avraham Weinberger']
const CONTACT_STATUSES = ['New','Hot','Active','Nurturing','Cold']

// ── ALL NODE DEFINITIONS ──────────────────────────────────────
const TRIGGER_NODES = [
  // Contact Triggers
  { type:'trigger_new_contact',      label:'New Contact Added',           icon:'✦',  color:'#0EA5E9', cat:'Contact',  desc:'Fires when a new contact is added to TargetOS' },
  { type:'trigger_contact_status',   label:'Contact Status Changes',      icon:'👤', color:'#0EA5E9', cat:'Contact',  desc:'Fires when a contact moves between Hot/Active/Nurturing/Cold' },
  { type:'trigger_no_activity',      label:'No Activity for X Days',      icon:'⏰', color:'#7C3AED', cat:'Contact',  desc:'No activity logged on a contact for X days' },
  { type:'trigger_birthday',         label:'Birthday Coming Up',          icon:'🎂', color:'#EC4899', cat:'Contact',  desc:'X days before a contact\'s birthday' },
  { type:'trigger_anniversary',      label:'Closing Anniversary',         icon:'🏡', color:'#10B981', cat:'Contact',  desc:'X days before a client\'s 1-year closing anniversary' },
  // Deal / Production Triggers (matches Monday board column IDs)
  { type:'trigger_deal_stage',       label:'Deal Stage Changes',          icon:'📊', color:'#D97706', cat:'Deal',     desc:'Stage column changes on Production board' },
  { type:'trigger_offer_accepted',   label:'Deal → Offer Accepted',       icon:'📝', color:'#CC2200', cat:'Deal',     desc:'Stage changes to "Offer Accapted" on Production board' },
  { type:'trigger_under_shtar',      label:'Deal → Under Shtar',          icon:'📜', color:'#bb3354', cat:'Deal',     desc:'Stage changes to "Under Shtar" on Production board' },
  { type:'trigger_under_contract',   label:'Deal → Under Contract',       icon:'🤝', color:'#2563EB', cat:'Deal',     desc:'Stage changes to "Under Contract" on Production board' },
  { type:'trigger_deal_closed',      label:'Deal → Closed',               icon:'🎉', color:'#16A34A', cat:'Deal',     desc:'Stage changes to "Closed" on Production board' },
  { type:'trigger_deal_fell',        label:'Deal Fell Through',           icon:'💔', color:'#DC2626', cat:'Deal',     desc:'Stage changes to "Deal Fell Through" on Production board' },
  { type:'trigger_ctc_change',       label:'CTC Stage Changes',           icon:'🔄', color:'#8B5CF6', cat:'Deal',     desc:'Contract to close column changes on Production board' },
  { type:'trigger_commission',       label:'Commission Received',         icon:'💰', color:'#D97706', cat:'Deal',     desc:'Commission Received column changes to Done' },
  // Listing Triggers (matches Monday board)
  { type:'trigger_listing_status',   label:'Listing Status Changes',      icon:'🏠', color:'#10B981', cat:'Listing',  desc:'Status column changes on Listings board' },
  { type:'trigger_listing_active',   label:'Listing Goes Active',         icon:'🔑', color:'#10B981', cat:'Listing',  desc:'Listing status changes to Active' },
  { type:'trigger_listing_ao',       label:'Listing → Accepted Offer',    icon:'📝', color:'#D97706', cat:'Listing',  desc:'Listing status changes to Accepted offer' },
  { type:'trigger_listing_sold',     label:'Listing Sold',                icon:'🏆', color:'#16A34A', cat:'Listing',  desc:'Listing status changes to Sold' },
  { type:'trigger_new_listing',      label:'New Listing Added',           icon:'🏠', color:'#10B981', cat:'Listing',  desc:'New item added to Active Listings group' },
  { type:'trigger_oh_visitor',       label:'Open House Visitor',          icon:'🏡', color:'#F59E0B', cat:'Listing',  desc:'Visitor signs in at an open house' },
  { type:'trigger_showing',          label:'Showing Logged',              icon:'👁',  color:'#8B5CF6', cat:'Listing',  desc:'A showing is logged on a listing' },
  // System Triggers
  { type:'trigger_task_overdue',     label:'Task Overdue',                icon:'⚠',  color:'#DC2626', cat:'Task',     desc:'A task passes its due date' },
  { type:'trigger_task_due',         label:'Task Due Soon',               icon:'✓',  color:'#7C3AED', cat:'Task',     desc:'X days before a task is due' },
  { type:'trigger_scheduled',        label:'Scheduled / Recurring',       icon:'📅', color:'#6366F1', cat:'System',   desc:'Fires on a daily/weekly/monthly schedule' },
]

const ACTION_NODES = [
  // Communication
  { type:'action_sms',               label:'Send SMS',                    icon:'💬', color:'#10B981', cat:'Communicate', desc:'Send an SMS via Twilio to contact or agent' },
  { type:'action_email',             label:'Send Email',                  icon:'✉',  color:'#0EA5E9', cat:'Communicate', desc:'Send an email via Resend' },
  { type:'action_whatsapp',          label:'Send WhatsApp',               icon:'📱', color:'#25D366', cat:'Communicate', desc:'Send WhatsApp message (requires Meta verification)' },
  { type:'action_notify_agent',      label:'Notify Agent (In-App)',       icon:'🔔', color:'#F59E0B', cat:'Communicate', desc:'Send an in-app notification to a specific agent' },
  { type:'action_announce',          label:'Post Team Announcement',      icon:'📣', color:'#8B5CF6', cat:'Communicate', desc:'Post to the team announcements feed' },
  { type:'action_celebrate',         label:'Send Celebration',            icon:'🎊', color:'#16A34A', cat:'Communicate', desc:'Trigger a team celebration message with confetti' },
  // Deal / Listing Actions (maps to real Monday column IDs)
  { type:'action_task',              label:'Create Task',                 icon:'✓',  color:'#7C3AED', cat:'Action',      desc:'Create a task in TargetOS and assign it' },
  { type:'action_assign_contact',    label:'Assign Contact to Agent',     icon:'👤', color:'#E8650A', cat:'Action',      desc:'Change the assigned agent on a contact' },
  { type:'action_contact_status',    label:'Change Contact Status',       icon:'⇄',  color:'#CC2200', cat:'Action',      desc:'Update contact status: Hot/Active/Nurturing/Cold' },
  { type:'action_tag_contact',       label:'Tag / Untag Contact',         icon:'🏷', color:'#F59E0B', cat:'Action',      desc:'Add or remove a tag on a contact' },
  { type:'action_deal_stage',        label:'Move Deal Stage',             icon:'📊', color:'#D97706', cat:'Action',      desc:'Change deal Stage column: Offer Accapted → Under Contract → Closed' },
  { type:'action_deal_ctc',          label:'Update CTC Stage',            icon:'🔄', color:'#8B5CF6', cat:'Action',      desc:'Update Contract to Close column on a deal' },
  { type:'action_listing_status',    label:'Update Listing Status',       icon:'🏠', color:'#10B981', cat:'Action',      desc:'Change listing Status column' },
  { type:'action_send_sign',         label:'Send Sign Request',           icon:'🪧', color:'#DC2626', cat:'Action',      desc:'Trigger sign deployment (Under Contract Sent / Sold Sign Sent)' },
  { type:'action_commission_status', label:'Update Commission Status',    icon:'💰', color:'#D97706', cat:'Action',      desc:'Update Commission Received or Agent Commission Sent' },
  // Advanced
  { type:'action_webhook',           label:'Send Webhook',                icon:'⚡', color:'#64748B', cat:'Advanced',   desc:'POST data to an external URL (Zapier, Make, n8n)' },
]

const RULE_NODES = [
  { type:'rule_wait',                label:'Wait / Delay',                icon:'⏱', color:'#94A3B8', cat:'Rule', desc:'Wait a set time before continuing' },
  { type:'rule_condition',           label:'Condition / If-Then',         icon:'⟨⟩', color:'#E8650A', cat:'Rule', desc:'Branch based on a Yes/No condition' },
  { type:'rule_ab_split',            label:'A/B Split',                   icon:'⚖', color:'#7C3AED', cat:'Rule', desc:'Split contacts randomly for A/B testing' },
  { type:'rule_time_window',         label:'Time Window',                 icon:'🕐', color:'#6366F1', cat:'Rule', desc:'Only continue during business hours' },
  { type:'rule_goal',                label:'Goal / Exit Condition',       icon:'🎯', color:'#16A34A', cat:'Rule', desc:'Exit flow if contact reaches a goal' },
  { type:'rule_exit',                label:'Exit Flow',                   icon:'↩', color:'#DC2626', cat:'Rule', desc:'End the automation here' },
]

// ── 10 PRESET AUTOMATIONS (using real Monday.com statuses) ────
const PRESETS = [
  {
    id:'p1', name:'New Lead Welcome Series', description:'Welcome new leads via SMS, notify agent, create urgent follow-up task',
    active:true, lastFired:'Jun 17', count:24, color:'#0EA5E9',
    nodes:[
      {id:'n1',type:'trigger_new_contact',label:'New Contact Added',icon:'✦',color:'#0EA5E9',x:240,y:50,config:{}},
      {id:'n2',type:'rule_wait',label:'Wait 5 Minutes',icon:'⏱',color:'#94A3B8',x:240,y:180,config:{duration:5,unit:'minutes'}},
      {id:'n3',type:'action_sms',label:'Welcome SMS to Contact',icon:'💬',color:'#10B981',x:240,y:310,config:{to:'contact',message:'Hi {name}! This is Target Team. We received your inquiry and will be in touch shortly. Questions? Call us anytime: 845.424.1014 🏠'}},
      {id:'n4',type:'action_notify_agent',label:'Notify Assigned Agent',icon:'🔔',color:'#F59E0B',x:240,y:440,config:{to:'assigned_agent',message:'🔥 New lead just added: {name} | {phone} | Source: {source}. Follow up NOW!'}},
      {id:'n5',type:'action_task',label:'Create Urgent Follow-up Task',icon:'✓',color:'#7C3AED',x:240,y:570,config:{title:'Follow up — {name} (new lead)',priority:'urgent',assignTo:'assigned_agent',dueIn:'same day'}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'},{from:'n4',to:'n5'}]
  },
  {
    id:'p2', name:'Offer Accepted — Launch CTC', description:'On Offer Accepted: celebrate, announce, launch secretary CTC tasks, notify admin',
    active:true, lastFired:'Jun 12', count:9, color:'#D97706',
    nodes:[
      {id:'n1',type:'trigger_offer_accepted',label:'Deal → Offer Accapted',icon:'📝',color:'#CC2200',x:240,y:50,config:{stage:'Offer Accapted',board:'Production'}},
      {id:'n2',type:'action_celebrate',label:'Team Celebration',icon:'🎊',color:'#16A34A',x:240,y:180,config:{message:'📝 OFFER ACCEPTED! Congrats to {agent} — {addr} at {price}!'}},
      {id:'n3',type:'action_announce',label:'Post to Team Feed',icon:'📣',color:'#8B5CF6',x:240,y:310,config:{title:'Offer Accepted — {addr}',body:'Congratulations {agent} on getting {addr} accepted! 🏡 Production board updated.'}},
      {id:'n4',type:'action_task',label:'Secretary: Attorney Review',icon:'✓',color:'#7C3AED',x:240,y:440,config:{title:'Attorney review period — {addr} (3 days)',priority:'urgent',assignTo:'Gitty Fogel',dueIn:'3 days'}},
      {id:'n5',type:'action_task',label:'Secretary: Order Title Search',icon:'✓',color:'#7C3AED',x:240,y:570,config:{title:'Order title search — {addr}',priority:'high',assignTo:'Gitty Fogel',dueIn:'5 days'}},
      {id:'n6',type:'action_notify_agent',label:'Notify Admin',icon:'🔔',color:'#F59E0B',x:240,y:700,config:{to:'Avraham Weinberger',message:'New AO: {addr} — {agent}. Review Production board and CTC.'}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'},{from:'n4',to:'n5'},{from:'n5',to:'n6'}]
  },
  {
    id:'p3', name:'Under Contract — Full CTC Launch', description:'When deal goes Under Contract: send sign, announce, start full CTC checklist',
    active:true, lastFired:'Jun 10', count:8, color:'#2563EB',
    nodes:[
      {id:'n1',type:'trigger_under_contract',label:'Deal → Under Contract',icon:'🤝',color:'#2563EB',x:240,y:50,config:{stage:'Under Contract',board:'Production'}},
      {id:'n2',type:'action_celebrate',label:'Under Contract Celebration',icon:'🎊',color:'#16A34A',x:240,y:180,config:{message:'🤝 UNDER CONTRACT! {agent} has {addr} under contract!'}},
      {id:'n3',type:'action_send_sign',label:'Send Under Contract Sign',icon:'🪧',color:'#DC2626',x:240,y:310,config:{signType:'Under Contract Sent',column:'label3'}},
      {id:'n4',type:'action_announce',label:'Post Announcement',icon:'📣',color:'#8B5CF6',x:240,y:440,config:{title:'Under Contract — {addr}',body:'🏡 Congratulations to {agent}! {addr} is now Under Contract at {price}!'}},
      {id:'n5',type:'action_task',label:'Secretary: Start CTC Board',icon:'✓',color:'#7C3AED',x:240,y:570,config:{title:'Update CTC board — {addr}',priority:'urgent',assignTo:'Gitty Fogel',dueIn:'same day'}},
      {id:'n6',type:'action_task',label:'Agent: Schedule Inspection',icon:'✓',color:'#7C3AED',x:240,y:700,config:{title:'Schedule home inspection — {addr}',priority:'high',assignTo:'assigned_agent',dueIn:'3 days'}},
      {id:'n7',type:'action_deal_ctc',label:'Update CTC: Inspection Scheduled',icon:'🔄',color:'#8B5CF6',x:240,y:830,config:{ctcStage:'Inspection scheduled',column:'color_mkqr8y3h'}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'},{from:'n4',to:'n5'},{from:'n5',to:'n6'},{from:'n6',to:'n7'}]
  },
  {
    id:'p4', name:'Deal Closed — Full Celebration', description:'Celebrate closing, send sold sign, order gift, thank you SMS to client',
    active:true, lastFired:'Jun 10', count:5, color:'#16A34A',
    nodes:[
      {id:'n1',type:'trigger_deal_closed',label:'Deal → Closed',icon:'🎉',color:'#16A34A',x:240,y:50,config:{stage:'Closed',board:'Production'}},
      {id:'n2',type:'action_celebrate',label:'Celebration Alert',icon:'🎊',color:'#16A34A',x:240,y:180,config:{message:'🏆 CLOSED! {agent} closed {addr} at {price}! GCI: {gci}'}},
      {id:'n3',type:'action_announce',label:'Post to Team Feed',icon:'📣',color:'#8B5CF6',x:240,y:310,config:{title:'CLOSED! {addr}',body:'🏆 Huge congrats to {agent} for closing {addr} at {price}! GCI: {gci}. Another win for Target Team!'}},
      {id:'n4',type:'action_send_sign',label:'Send Sold Sign',icon:'🪧',color:'#DC2626',x:240,y:440,config:{signType:'Sold Sign Sent',column:'label3'}},
      {id:'n5',type:'action_task',label:'Secretary: Order Closing Gift',icon:'✓',color:'#7C3AED',x:240,y:570,config:{title:'Order closing gift — {addr} clients',priority:'normal',assignTo:'Gitty Fogel',dueIn:'2 days'}},
      {id:'n6',type:'rule_wait',label:'Wait 7 Days',icon:'⏱',color:'#94A3B8',x:240,y:700,config:{duration:7,unit:'days'}},
      {id:'n7',type:'action_sms',label:'Thank You SMS to Client',icon:'💬',color:'#10B981',x:240,y:830,config:{to:'client',message:"Hi {client_name}! 🏡 It was truly a pleasure helping you with {addr}. Enjoy every moment in your new home! If you ever need anything, we're always here. — Target Team 845.424.1014"}},
      {id:'n8',type:'action_commission_status',label:'Commission: Mark Pending',icon:'💰',color:'#D97706',x:240,y:960,config:{field:'Commission Received',status:'Working on it',column:'status_16'}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'},{from:'n4',to:'n5'},{from:'n5',to:'n6'},{from:'n6',to:'n7'},{from:'n7',to:'n8'}]
  },
  {
    id:'p5', name:'No Activity Re-engagement', description:'5 days no activity: if Hot/Active → urgent task + SMS; else → change to Nurturing',
    active:true, lastFired:'Jun 15', count:31, color:'#7C3AED',
    nodes:[
      {id:'n1',type:'trigger_no_activity',label:'No Activity — 5 Days',icon:'⏰',color:'#7C3AED',x:240,y:50,config:{days:5,applyTo:'All Contacts'}},
      {id:'n2',type:'rule_condition',label:'Is contact Hot or Active?',icon:'⟨⟩',color:'#E8650A',x:240,y:180,config:{field:'status',operator:'in',value:'Hot,Active'}},
      {id:'n3',type:'action_task',label:'Create Urgent Task',icon:'✓',color:'#7C3AED',x:110,y:320,config:{title:'Re-engage {name} — no activity 5 days',priority:'urgent',assignTo:'assigned_agent'}},
      {id:'n4',type:'action_sms',label:'Send Check-in SMS',icon:'💬',color:'#10B981',x:110,y:450,config:{to:'contact',message:'Hi {name}! Just checking in — are you still looking? We have new listings you might love. Call us: 845.424.1014 — Target Team'}},
      {id:'n5',type:'action_contact_status',label:'Change Status: Nurturing',icon:'⇄',color:'#CC2200',x:380,y:320,config:{status:'Nurturing'}},
      {id:'n6',type:'rule_exit',label:'Exit Flow',icon:'↩',color:'#DC2626',x:380,y:450,config:{}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3',label:'Yes'},{from:'n2',to:'n5',label:'No'},{from:'n3',to:'n4'},{from:'n5',to:'n6'}]
  },
  {
    id:'p6', name:'Birthday Reminder', description:'Notify agent 3 days before birthday, send birthday SMS on the day',
    active:true, lastFired:'', count:0, color:'#EC4899',
    nodes:[
      {id:'n1',type:'trigger_birthday',label:'Birthday in 3 Days',icon:'🎂',color:'#EC4899',x:240,y:50,config:{daysBefore:3}},
      {id:'n2',type:'action_notify_agent',label:'Notify Agent — 3 Days Out',icon:'🔔',color:'#F59E0B',x:240,y:180,config:{to:'assigned_agent',message:"🎂 Heads up! {name}'s birthday is in 3 days. Great time to reach out with a personal message!"}},
      {id:'n3',type:'rule_wait',label:'Wait 3 Days',icon:'⏱',color:'#94A3B8',x:240,y:310,config:{duration:3,unit:'days'}},
      {id:'n4',type:'action_sms',label:'Happy Birthday SMS',icon:'💬',color:'#10B981',x:240,y:440,config:{to:'contact',message:'🎂 Happy Birthday {name}! Wishing you a wonderful day filled with joy! — Target Team 🏡'}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'}]
  },
  {
    id:'p7', name:'Closing Anniversary Outreach', description:'1-year anniversary: task agent + send SMS for referrals',
    active:true, lastFired:'', count:0, color:'#8B5CF6',
    nodes:[
      {id:'n1',type:'trigger_anniversary',label:'Closing Anniversary — 7 Days',icon:'🏡',color:'#10B981',x:240,y:50,config:{daysBefore:7}},
      {id:'n2',type:'action_task',label:'Plan Anniversary Outreach',icon:'✓',color:'#7C3AED',x:240,y:180,config:{title:"1-year anniversary outreach — {name} ({addr})",assignTo:'assigned_agent',priority:'normal',dueIn:'7 days'}},
      {id:'n3',type:'rule_wait',label:'Wait Until Anniversary Day',icon:'⏱',color:'#94A3B8',x:240,y:310,config:{duration:7,unit:'days'}},
      {id:'n4',type:'action_sms',label:'Anniversary SMS',icon:'💬',color:'#10B981',x:240,y:440,config:{to:'contact',message:"Hi {name}! 🏡 Can you believe it's already been a year since you closed on {addr}? We hope you're loving every moment! If you know anyone looking to buy or sell, we'd love a referral. — Target Team 845.424.1014"}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'}]
  },
  {
    id:'p8', name:'New Listing Launch', description:'New listing added: announce to team, post on social, schedule photography',
    active:false, lastFired:'', count:0, color:'#10B981',
    nodes:[
      {id:'n1',type:'trigger_new_listing',label:'New Listing Added',icon:'🏠',color:'#10B981',x:240,y:50,config:{group:'Active Listings'}},
      {id:'n2',type:'action_announce',label:'Announce New Listing',icon:'📣',color:'#8B5CF6',x:240,y:180,config:{title:'New Listing — {addr}, {city}',body:'🏠 New listing alert! {addr}, {city} — {type} · {beds}bd/{baths}ba at {price}. Listed by {agent}. Buyer\'s agent: {buyersAgent}%'}},
      {id:'n3',type:'action_task',label:'Post to Social Media',icon:'✓',color:'#7C3AED',x:240,y:310,config:{title:'Post {addr} to @thetargetteam Instagram & Facebook',assignTo:'Yanky Lichtenstein',priority:'normal',dueIn:'same day'}},
      {id:'n4',type:'action_task',label:'Schedule Photography',icon:'✓',color:'#7C3AED',x:240,y:440,config:{title:'Schedule photography for {addr}',assignTo:'assigned_agent',priority:'high',dueIn:'2 days'}},
      {id:'n5',type:'action_task',label:'Print Shul Posters',icon:'✓',color:'#7C3AED',x:240,y:570,config:{title:'Order Shul posters for {addr}',assignTo:'Gitty Fogel',priority:'normal',dueIn:'3 days'}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'},{from:'n4',to:'n5'}]
  },
  {
    id:'p9', name:'Open House Follow-up Series', description:'After open house: thank you SMS, add to CRM, 3-day follow-up',
    active:true, lastFired:'Jun 14', count:18, color:'#F59E0B',
    nodes:[
      {id:'n1',type:'trigger_oh_visitor',label:'Open House Visitor Signs In',icon:'🏡',color:'#F59E0B',x:240,y:50,config:{}},
      {id:'n2',type:'rule_wait',label:'Wait 2 Hours',icon:'⏱',color:'#94A3B8',x:240,y:180,config:{duration:2,unit:'hours'}},
      {id:'n3',type:'action_sms',label:'Thank You SMS',icon:'💬',color:'#10B981',x:240,y:310,config:{to:'contact',message:"Hi {name}! 🏠 Thanks for visiting {addr} today. Let us know if you have questions or would like a second showing. — Target Team 845.424.1014"}},
      {id:'n4',type:'action_task',label:'Follow Up with Visitor',icon:'✓',color:'#7C3AED',x:240,y:440,config:{title:'Follow up — open house visitor: {name} at {addr}',assignTo:'assigned_agent',priority:'high'}},
      {id:'n5',type:'rule_wait',label:'Wait 3 Days',icon:'⏱',color:'#94A3B8',x:240,y:570,config:{duration:3,unit:'days'}},
      {id:'n6',type:'action_sms',label:'Second Follow-up SMS',icon:'💬',color:'#10B981',x:240,y:700,config:{to:'contact',message:"Hi {name}! 👋 Following up from the open house at {addr}. Still interested? We have several great options in your budget. — Target Team 845.424.1014"}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'},{from:'n4',to:'n5'},{from:'n5',to:'n6'}]
  },
  {
    id:'p10', name:'Deal Fell Through — Recovery', description:'When deal falls: notify admin, task agent to re-list, change listing status back',
    active:true, lastFired:'', count:2, color:'#DC2626',
    nodes:[
      {id:'n1',type:'trigger_deal_fell',label:'Deal Fell Through',icon:'💔',color:'#DC2626',x:240,y:50,config:{stage:'Deal Fell Through',board:'Production'}},
      {id:'n2',type:'action_notify_agent',label:'Notify Admin Immediately',icon:'🔔',color:'#F59E0B',x:240,y:180,config:{to:'Avraham Weinberger',message:'⚠️ DEAL FELL THROUGH: {addr} — {agent}. Production board stage: Deal Fell Through. Please review.'}},
      {id:'n3',type:'action_task',label:'Agent: Re-activate Listing',icon:'✓',color:'#7C3AED',x:240,y:310,config:{title:'Re-list {addr} — deal fell through',priority:'urgent',assignTo:'assigned_agent',dueIn:'same day'}},
      {id:'n4',type:'action_listing_status',label:'Update Listing → Active',icon:'🏠',color:'#10B981',x:240,y:440,config:{status:'Active',column:'status'}},
      {id:'n5',type:'rule_wait',label:'Wait 1 Day',icon:'⏱',color:'#94A3B8',x:240,y:570,config:{duration:1,unit:'days'}},
      {id:'n6',type:'action_task',label:'Secretary: Update CTC Board',icon:'✓',color:'#7C3AED',x:240,y:700,config:{title:'Remove {addr} from Under Contract — deal fell through',assignTo:'Gitty Fogel',priority:'urgent',dueIn:'same day'}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'},{from:'n4',to:'n5'},{from:'n5',to:'n6'}]
  },
]

// ── MAIN PAGE ──────────────────────────────────────────────────
export function Automations() {
  const { confirm, ConfirmDialog } = useConfirm()
  const { toast } = useApp()
  const [view, setView] = useState('list')
  const [automations, setAutomations] = useState(PRESETS)

  // Load saved automations from Supabase on mount, merge with presets
  useEffect(() => {
    async function loadAutomations() {
      try {
        const { data, error } = await supabase.from('automations').select('*')
        if(data && data.length > 0) {
          // Merge DB automations with presets (DB wins for matching IDs)
          const dbIds = new Set(data.map(a => a.id))
          const merged = [
            ...PRESETS.filter(p => !dbIds.has(p.id)), // presets not in DB
            ...data.map(a => ({
              ...a,
              nodes: a.nodes || [],
              connections: a.connections || [],
              count: a.fire_count || 0,
              lastFired: a.last_fired ? new Date(a.last_fired).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '',
              color: a.color || '#CC2200',
            }))
          ]
          setAutomations(merged)
        } else {
          // First time — push presets to DB
          await syncPresetsToDB(PRESETS)
        }
      } catch(e) {
        console.log('Automations table not yet created — using presets only')
      }
    }
    loadAutomations()
  }, [])

  async function syncPresetsToDB(presets) {
    try {
      await supabase.from('automations').upsert(
        presets.map(a => ({
          id: a.id, name: a.name, description: a.description,
          active: a.active, nodes: a.nodes, connections: a.connections,
          fire_count: a.count || 0, color: a.color
        })),
        { onConflict: 'id' }
      )
    } catch(e) { console.log('DB sync skipped:', e.message) }
  }

  async function persistAutomation(auto) {
    try {
      await supabase.from('automations').upsert({
        id: auto.id, name: auto.name, description: auto.description,
        active: auto.active, nodes: auto.nodes, connections: auto.connections,
        fire_count: auto.count || 0, color: auto.color,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
    } catch(e) { console.log('DB persist skipped:', e.message) }
  }
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  function newAutomation() {
    setEditing({ id:'auto_'+Date.now(), name:'New Automation', description:'', active:false, lastFired:'', count:0, color:'#CC2200', nodes:[], connections:[] })
    setView('builder')
  }

  function saveAuto(auto) {
    setAutomations(prev => { const e=prev.find(a=>a.id===auto.id); return e?prev.map(a=>a.id===auto.id?auto:a):[...prev,auto] })
    persistAutomation(auto)
    setView('list'); setEditing(null)
    toast('Automation saved!')
  }

  function toggleActive(id) {
    setAutomations(prev => {
      const updated = prev.map(a => a.id===id ? {...a,active:!a.active} : a)
      const changed = updated.find(a => a.id===id)
      if(changed) persistAutomation(changed)
      return updated
    })
  }

  function deleteAuto(id) {
    const a = automations.find(x=>x.id===id)
    confirm({ title:'Delete Automation?', message:`"${a?.name}" will be permanently deleted.`, confirmLabel:'Delete', onConfirm:async()=>{
      setAutomations(prev=>prev.filter(x=>x.id!==id))
      try { await supabase.from('automations').delete().eq('id',id) } catch(e) {}
    }})
  }

  if(view==='builder' && editing) return (
    <AutomationBuilder automation={editing} onSave={saveAuto} onCancel={()=>{setView('list');setEditing(null)}}/>
  )

  const filtered = automations.filter(a => {
    if(search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.description.toLowerCase().includes(search.toLowerCase())) return false
    if(filterStatus==='active' && !a.active) return false
    if(filterStatus==='paused' && a.active) return false
    return true
  })

  return (
    <div>
      <ConfirmDialog/>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'16px'}}>
        {[
          ['Total Automations', automations.length, 'var(--text)'],
          ['Active', automations.filter(a=>a.active).length, '#16A34A'],
          ['Paused', automations.filter(a=>!a.active).length, '#D97706'],
          ['Times Fired', automations.reduce((s,a)=>s+a.count,0), '#CC2200'],
        ].map(([k,v,c])=>(
          <div key={k} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'14px'}}>
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'5px'}}>{k}</div>
            <div style={{fontSize:'26px',fontWeight:900,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'8px'}}>
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search automations..."
            style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px 12px',outline:'none',width:'220px',fontFamily:'Inter,system-ui,sans-serif'}}
            onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
          <div style={{display:'flex',background:'var(--dim)',borderRadius:'8px',padding:'3px',gap:'2px'}}>
            {[['all','All'],['active','Active'],['paused','Paused']].map(([k,l])=>(
              <button key={k} onClick={()=>setFilterStatus(k)} style={{padding:'5px 11px',borderRadius:'6px',border:'none',cursor:'pointer',fontSize:'11px',fontWeight:600,fontFamily:'Inter,system-ui,sans-serif',background:filterStatus===k?'var(--panel)':'transparent',color:filterStatus===k?'var(--text)':'var(--muted)'}}>{l}</button>
            ))}
          </div>
        </div>
        <Btn size="sm" onClick={newAutomation}>+ Create Automation</Btn>
      </div>

      {/* Grid */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:'12px'}}>
        {filtered.map(auto => {
          const trigger = auto.nodes.find(n=>n.type.startsWith('trigger_'))
          const actions = auto.nodes.filter(n=>n.type.startsWith('action_'))
          const rules   = auto.nodes.filter(n=>n.type.startsWith('rule_')&&n.type!=='rule_exit')
          return (
            <div key={auto.id} style={{background:'var(--panel)',border:'1.5px solid '+(auto.active?auto.color+'55':'var(--border)'),borderRadius:'14px',overflow:'hidden',transition:'border-color .15s'}}>
              <div style={{height:4,background:auto.active?auto.color:'var(--dim)'}}/>
              <div style={{padding:'16px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'10px'}}>
                  <div style={{flex:1,marginRight:'12px'}}>
                    <div style={{fontSize:'14px',fontWeight:800,marginBottom:'3px'}}>{auto.name}</div>
                    <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.5}}>{auto.description}</div>
                  </div>
                  <div onClick={()=>toggleActive(auto.id)} style={{width:44,height:24,borderRadius:'99px',background:auto.active?'#10B981':'var(--border)',position:'relative',cursor:'pointer',flexShrink:0,transition:'background .2s'}}>
                    <div style={{width:20,height:20,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:auto.active?22:2,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
                  </div>
                </div>

                {/* Flow chips */}
                <div style={{background:'var(--dim)',borderRadius:'10px',padding:'9px',marginBottom:'10px',display:'flex',gap:'4px',flexWrap:'wrap',alignItems:'center'}}>
                  {trigger && <span style={{fontSize:'10px',fontWeight:700,padding:'3px 8px',borderRadius:'20px',background:trigger.color+'18',color:trigger.color,whiteSpace:'nowrap'}}>{trigger.icon} {trigger.label.split(' ').slice(0,3).join(' ')}</span>}
                  {rules.slice(0,1).map((n,i)=><React.Fragment key={i}><span style={{color:'var(--muted)',fontSize:'10px'}}>→</span><span style={{fontSize:'10px',fontWeight:700,padding:'3px 8px',borderRadius:'20px',background:n.color+'18',color:n.color,whiteSpace:'nowrap'}}>{n.icon} {n.label.split(' ').slice(0,2).join(' ')}</span></React.Fragment>)}
                  {actions.slice(0,2).map((n,i)=><React.Fragment key={i}><span style={{color:'var(--muted)',fontSize:'10px'}}>→</span><span style={{fontSize:'10px',fontWeight:700,padding:'3px 8px',borderRadius:'20px',background:n.color+'18',color:n.color,whiteSpace:'nowrap'}}>{n.icon} {n.label.split(' ').slice(0,2).join(' ')}</span></React.Fragment>)}
                  {auto.nodes.length>4 && <span style={{fontSize:'10px',color:'var(--muted)'}}>+{auto.nodes.length-4}</span>}
                </div>

                {/* Meta */}
                <div style={{display:'flex',gap:'14px',fontSize:'11px',color:'var(--muted)',marginBottom:'12px'}}>
                  <span>📋 {auto.nodes.length} steps</span>
                  <span>⚡ {auto.count}× fired</span>
                  {auto.lastFired && <span>🕐 {auto.lastFired}</span>}
                </div>

                <div style={{display:'flex',gap:'6px'}}>
                  <Btn size="xs" onClick={()=>{setEditing({...auto,nodes:auto.nodes.map(n=>({...n})),connections:[...auto.connections]});setView('builder')}}>✏️ Edit Flow</Btn>
                  <Btn size="xs" variant="ghost" onClick={()=>{toggleActive(auto.id);alert(auto.active?`"${auto.name}" paused.`:`"${auto.name}" is now active!`)}}>{auto.active?'⏸ Pause':'▶ Activate'}</Btn>
                  <Btn size="xs" variant="danger" onClick={()=>deleteAuto(auto.id)}>🗑</Btn>
                </div>
              </div>
            </div>
          )
        })}

        {/* Add new */}
        <div onClick={newAutomation} style={{background:'transparent',border:'2px dashed var(--border)',borderRadius:'14px',padding:'32px 24px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',cursor:'pointer',minHeight:'200px',transition:'all .15s'}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor='#CC2200';e.currentTarget.style.background='rgba(204,34,0,.03)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.background='transparent'}}>
          <div style={{fontSize:'36px',marginBottom:'10px',opacity:.35}}>⚡</div>
          <div style={{fontSize:'13px',fontWeight:700,color:'var(--muted)',marginBottom:'4px'}}>Create Automation</div>
          <div style={{fontSize:'11px',color:'var(--muted)',opacity:.7}}>Visual drag-and-drop builder</div>
        </div>
      </div>
    </div>
  )
}

// ── VISUAL BUILDER ─────────────────────────────────────────────
function AutomationBuilder({ automation, onSave, onCancel }) {
  const { confirm, ConfirmDialog } = useConfirm()
  const { toast } = useApp()
  const [auto, setAuto] = useState({...automation,nodes:[...automation.nodes],connections:[...automation.connections]})
  const [selected, setSelected] = useState(null)
  const [connecting, setConnecting] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [dragOff, setDragOff] = useState({x:0,y:0})
  const [nameEdit, setNameEdit] = useState(false)
  const [activeSection, setActiveSection] = useState('Triggers')
  const canvasRef = useRef()

  const selectedNode = auto.nodes.find(n=>n.id===selected)
  const canvasH = Math.max(700, ...(auto.nodes.length?auto.nodes.map(n=>n.y+200):[700]))

  function addNode(def) {
    const id = 'n'+Date.now()
    const yMax = auto.nodes.length > 0 ? Math.max(...auto.nodes.map(n=>n.y)) + 140 : 50
    const node = { id, type:def.type, label:def.label, icon:def.icon, color:def.color, x:220, y:yMax, config:{} }
    const newNodes = [...auto.nodes, node]
    let newConns = [...auto.connections]
    if(auto.nodes.length > 0 && !def.type.startsWith('trigger_')) {
      const lastNode = auto.nodes.reduce((p,c)=>c.y>p.y?c:p)
      newConns = [...newConns, {from:lastNode.id, to:id, label:''}]
    }
    setAuto(a=>({...a, nodes:newNodes, connections:newConns}))
    setSelected(id)
  }

  function startDrag(e, id) {
    const n = auto.nodes.find(x=>x.id===id)
    const r = canvasRef.current.getBoundingClientRect()
    setDragId(id); setDragOff({x:e.clientX-r.left-n.x, y:e.clientY-r.top-n.y}); e.preventDefault()
  }

  function onMove(e) {
    if(!dragId) return
    const r = canvasRef.current.getBoundingClientRect()
    setAuto(a=>({...a,nodes:a.nodes.map(n=>n.id===dragId?{...n,x:Math.max(10,e.clientX-r.left-dragOff.x),y:Math.max(10,e.clientY-r.top-dragOff.y)}:n)}))
  }

  function connect(toId) {
    if(!connecting||connecting===toId) { setConnecting(null); return }
    if(auto.connections.find(c=>c.from===connecting&&c.to===toId)) { setConnecting(null); return }
    const fromNode = auto.nodes.find(n=>n.id===connecting)
    const isCondition = fromNode?.type==='rule_condition'||fromNode?.type==='rule_ab_split'
    const existingConns = auto.connections.filter(c=>c.from===connecting)
    const label = isCondition ? (existingConns.length===0?'Yes':'No') : ''
    setAuto(a=>({...a,connections:[...a.connections,{from:connecting,to:toId,label}]}))
    setConnecting(null)
  }

  const SECTIONS = { Triggers: TRIGGER_NODES, Actions: ACTION_NODES, Rules: RULE_NODES }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 110px)'}}>
      <ConfirmDialog/>

      {/* Toolbar */}
      <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'10px 16px',marginBottom:'10px',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0,gap:'10px',flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
          <button onClick={onCancel} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',fontWeight:600}}>← Back</button>
          <div style={{width:1,height:20,background:'var(--border)'}}/>
          {nameEdit
            ? <input value={auto.name} onChange={e=>setAuto(a=>({...a,name:e.target.value}))} onBlur={()=>setNameEdit(false)} onKeyDown={e=>e.key==='Enter'&&setNameEdit(false)} autoFocus style={{background:'var(--inp)',border:'1.5px solid #CC2200',borderRadius:'8px',color:'var(--text)',fontSize:'14px',fontWeight:800,padding:'4px 10px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}/>
            : <span onClick={()=>setNameEdit(true)} style={{fontSize:'14px',fontWeight:800,cursor:'pointer'}}>{auto.name} <span style={{fontSize:'11px',color:'var(--muted)',fontWeight:400}}>✏</span></span>
          }
          <div onClick={()=>setAuto(a=>({...a,active:!a.active}))} style={{display:'flex',alignItems:'center',gap:'6px',background:auto.active?'rgba(16,185,129,.1)':'var(--dim)',borderRadius:'20px',padding:'5px 12px',cursor:'pointer',border:'1px solid '+(auto.active?'rgba(16,185,129,.3)':'var(--border)')}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:auto.active?'#10B981':'#94A3B8'}}/>
            <span style={{fontSize:'11px',fontWeight:700,color:auto.active?'#10B981':'#94A3B8'}}>{auto.active?'Active':'Paused'}</span>
          </div>
          <span style={{fontSize:'11px',color:'var(--muted)'}}>{auto.nodes.length} steps · {auto.connections.length} connections</span>
        </div>
        <div style={{display:'flex',gap:'7px'}}>
          <Btn size="sm" variant="ghost" onClick={()=>confirm({title:'Clear Canvas?',message:'Remove all nodes?',confirmLabel:'Clear',onConfirm:()=>{setAuto(a=>({...a,nodes:[],connections:[]}));setSelected(null)}})}>Clear</Btn>
          <Btn size="sm" onClick={()=>onSave(auto)}>💾 Save</Btn>
        </div>
      </div>

      <div style={{display:'flex',gap:'10px',flex:1,overflow:'hidden',minHeight:0}}>
        {/* Left panel */}
        <div style={{width:'210px',flexShrink:0,overflowY:'auto',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'12px'}}>
          <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'8px'}}>Node Library</div>
          <div style={{display:'flex',gap:'3px',marginBottom:'10px'}}>
            {Object.keys(SECTIONS).map(s=>(
              <button key={s} onClick={()=>setActiveSection(s)} style={{flex:1,padding:'5px 3px',borderRadius:'6px',border:'none',cursor:'pointer',fontSize:'9px',fontWeight:700,fontFamily:'Inter,system-ui,sans-serif',background:activeSection===s?'#CC2200':'var(--dim)',color:activeSection===s?'#fff':'var(--muted)'}}>{s}</button>
            ))}
          </div>
          {SECTIONS[activeSection].map(node=>(
            <div key={node.type} onClick={()=>addNode(node)} draggable onDragStart={e=>e.dataTransfer.setData('nd',JSON.stringify(node))} title={node.desc}
              style={{display:'flex',alignItems:'center',gap:'8px',padding:'7px 8px',background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'8px',marginBottom:'4px',cursor:'pointer',transition:'all .1s'}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=node.color;e.currentTarget.style.background=node.color+'12'}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.background='var(--dim)'}}>
              <div style={{width:24,height:24,borderRadius:'6px',background:node.color+'20',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',flexShrink:0}}>{node.icon}</div>
              <div>
                <div style={{fontSize:'10px',fontWeight:600,lineHeight:1.3,color:'var(--text)'}}>{node.label}</div>
                <div style={{fontSize:'8px',color:'var(--muted)'}}>{node.cat}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div style={{flex:1,overflow:'auto',background:'var(--dim)',borderRadius:'14px',border:'1px solid var(--border)',position:'relative'}}
          onClick={e=>{if(e.target===e.currentTarget){setSelected(null);setConnecting(null)}}}
          onDragOver={e=>e.preventDefault()}
          onDrop={e=>{e.preventDefault();const d=e.dataTransfer.getData('nd');if(d){const nd=JSON.parse(d);const r=canvasRef.current.getBoundingClientRect();const nn={id:'n'+Date.now(),type:nd.type,label:nd.label,icon:nd.icon,color:nd.color,x:Math.max(20,e.clientX-r.left-80),y:Math.max(20,e.clientY-r.top-30),config:{}};setAuto(a=>({...a,nodes:[...a.nodes,nn]}));setSelected(nn.id)}}}>
          <div ref={canvasRef} style={{position:'relative',minHeight:canvasH+'px',minWidth:'560px'}} onMouseMove={onMove} onMouseUp={()=>setDragId(null)}>
            <svg style={{position:'absolute',inset:0,width:'100%',height:canvasH+'px',pointerEvents:'none'}}>
              <defs>
                <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" fill="var(--border)" opacity=".6"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#dots)"/>
              {auto.connections.map((conn,i)=>{
                const f=auto.nodes.find(n=>n.id===conn.from), t=auto.nodes.find(n=>n.id===conn.to)
                if(!f||!t) return null
                const fw=165,fx=f.x+fw/2,fy=f.y+62,tx=t.x+fw/2,ty=t.y,my=(fy+ty)/2
                const path=`M${fx},${fy} C${fx},${my} ${tx},${my} ${tx},${ty}`
                const clr=conn.label==='Yes'?'#16A34A':conn.label==='No'?'#DC2626':'#CC2200'
                return (
                  <g key={i} onClick={()=>{if(window.confirm('Remove this connection?'))setAuto(a=>({...a,connections:a.connections.filter((_,j)=>j!==i)}))}} style={{cursor:'pointer'}}>
                    <defs><marker id={`a${i}`} markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3z" fill={clr}/></marker></defs>
                    <path d={path} stroke={clr} strokeWidth="2.5" fill="none" strokeDasharray={conn.label==='No'?"7,4":undefined} markerEnd={`url(#a${i})`} opacity=".85"/>
                    {conn.label&&<><rect x={(fx+tx)/2-13} y={my-10} width={26} height={16} rx={8} fill={clr}/><text x={(fx+tx)/2} y={my+2} textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff" style={{fontFamily:'Inter,system-ui,sans-serif'}}>{conn.label}</text></>}
                  </g>
                )
              })}
            </svg>
            {auto.nodes.map(node=>{
              const isSel=selected===node.id, isConn=connecting===node.id
              const cfgPreview = node.config
                ? node.type==='rule_wait'?`${node.config.duration||''} ${node.config.unit||'days'}`
                  : node.type.startsWith('action_sms')||node.type==='action_email'?`"${(node.config.message||node.config.body||'').slice(0,30)}..."`
                  : node.config.stage||node.config.status||node.config.days&&`${node.config.days}d`||node.config.ctcStage||node.config.to||null
                : null
              return (
                <div key={node.id} style={{position:'absolute',left:node.x,top:node.y,width:165,userSelect:'none',zIndex:isSel?10:1}}>
                  <div onMouseDown={e=>startDrag(e,node.id)} onClick={e=>{e.stopPropagation();connecting?connect(node.id):setSelected(node.id)}}
                    style={{background:'var(--panel)',border:'2px solid '+(isSel?node.color:isConn?'#CC2200':'var(--border)'),borderRadius:'12px',padding:'10px 11px',cursor:connecting?'crosshair':'grab',boxShadow:isSel?'0 4px 20px rgba(0,0,0,.15)':'0 2px 6px rgba(0,0,0,.06)',transition:'border-color .12s'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'7px',marginBottom:cfgPreview?'5px':'0'}}>
                      <div style={{width:26,height:26,borderRadius:'7px',background:node.color+'18',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',flexShrink:0}}>{node.icon}</div>
                      <div>
                        <div style={{fontSize:'10px',fontWeight:700,lineHeight:1.3}}>{node.label}</div>
                        <div style={{fontSize:'8px',color:node.color,fontWeight:600,textTransform:'uppercase',letterSpacing:'.4px'}}>{node.type.split('_')[0]}</div>
                      </div>
                    </div>
                    {cfgPreview&&<div style={{fontSize:'8px',color:'var(--muted)',background:'var(--dim)',borderRadius:'5px',padding:'3px 6px',wordBreak:'break-word',lineHeight:1.4}}>{cfgPreview}</div>}
                  </div>
                  <div onClick={e=>{e.stopPropagation();connecting===node.id?setConnecting(null):connecting?connect(node.id):setConnecting(node.id)}} title="Connect"
                    style={{width:16,height:16,borderRadius:'50%',background:isConn?'#CC2200':'var(--panel)',border:'2px solid '+(isConn?'#CC2200':node.color),margin:'4px auto 0',cursor:'pointer',boxShadow:'0 2px 4px rgba(0,0,0,.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'8px',color:isConn?'#fff':node.color}}>
                    {isConn?'✕':'+'}
                  </div>
                </div>
              )
            })}
            {auto.nodes.length===0&&(
              <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
                <div style={{fontSize:'48px',opacity:.2,marginBottom:'14px'}}>⚡</div>
                <div style={{fontSize:'15px',fontWeight:700,color:'var(--muted)',opacity:.5}}>Drag or click nodes from the left panel</div>
                <div style={{fontSize:'12px',color:'var(--muted)',opacity:.4,marginTop:'5px'}}>Start with a Trigger, then add Actions and Rules</div>
              </div>
            )}
          </div>
        </div>

        {/* Right config panel */}
        {selectedNode&&(
          <div style={{width:'250px',flexShrink:0,background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'14px',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
              <span style={{fontSize:'12px',fontWeight:700}}>Configure Node</span>
              <button onClick={()=>setSelected(null)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'16px',lineHeight:1}}>✕</button>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'8px',background:selectedNode.color+'12',borderRadius:'9px',padding:'9px',marginBottom:'14px',border:'1px solid '+selectedNode.color+'30'}}>
              <div style={{width:32,height:32,borderRadius:'8px',background:selectedNode.color+'20',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px'}}>{selectedNode.icon}</div>
              <div>
                <div style={{fontSize:'11px',fontWeight:700}}>{selectedNode.label}</div>
                <div style={{fontSize:'9px',color:selectedNode.color,fontWeight:600,textTransform:'uppercase'}}>{selectedNode.cat||selectedNode.type.split('_')[0]}</div>
              </div>
            </div>
            <NodeConfig node={selectedNode} onChange={cfg=>setAuto(a=>({...a,nodes:a.nodes.map(n=>n.id===selectedNode.id?{...n,config:cfg}:n)}))}/>
            <div style={{marginTop:'14px',paddingTop:'12px',borderTop:'1px solid var(--border)'}}>
              <button onClick={()=>confirm({title:'Delete Node?',message:'Remove this step?',confirmLabel:'Delete',onConfirm:()=>{setAuto(a=>({...a,nodes:a.nodes.filter(n=>n.id!==selectedNode.id),connections:a.connections.filter(c=>c.from!==selectedNode.id&&c.to!==selectedNode.id)}));setSelected(null)}})}
                style={{width:'100%',background:'rgba(220,38,38,.06)',border:'1px solid rgba(220,38,38,.2)',borderRadius:'8px',color:'#DC2626',fontSize:'11px',fontWeight:700,padding:'8px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
                🗑 Remove Node
              </button>
            </div>
          </div>
        )}
      </div>

      {connecting&&(
        <div style={{position:'fixed',bottom:'20px',left:'50%',transform:'translateX(-50%)',background:'#1B2B4B',color:'#fff',borderRadius:'12px',padding:'10px 22px',fontSize:'12px',fontWeight:600,zIndex:100,boxShadow:'0 8px 28px rgba(0,0,0,.3)',display:'flex',alignItems:'center',gap:'10px'}}>
          <span style={{color:'#CC2200',fontSize:'16px'}}>🔗</span>
          Click the <strong style={{color:'#CC2200'}}>+</strong> button on another node to connect · Esc to cancel
        </div>
      )}
    </div>
  )
}

// ── NODE CONFIG FORMS (uses real Monday column values) ─────────
function NodeConfig({ node, onChange }) {
  const cfg = node.config || {}
  const set = (k,v) => onChange({...cfg,[k]:v})

  function F(label, key, type='text', opts=null, ph='', help='') {
    const inp = opts
      ? <select value={cfg[key]||''} onChange={e=>set(key,e.target.value)} style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'11px',fontFamily:'Inter,system-ui,sans-serif',padding:'7px 8px',outline:'none'}}>
          <option value="">Select...</option>
          {opts.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
      : type==='textarea'
      ? <textarea value={cfg[key]||''} onChange={e=>set(key,e.target.value)} placeholder={ph} rows={3} style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'11px',fontFamily:'Inter,system-ui,sans-serif',padding:'7px 8px',outline:'none',resize:'vertical',boxSizing:'border-box'}}/>
      : <input type={type} value={cfg[key]||''} onChange={e=>set(key,e.target.value)} placeholder={ph} style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'11px',fontFamily:'Inter,system-ui,sans-serif',padding:'7px 8px',outline:'none',boxSizing:'border-box'}}/>
    return (
      <div style={{marginBottom:'11px'}}>
        <label style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px'}}>{label}</label>
        {inp}
        {help&&<div style={{fontSize:'9px',color:'var(--muted)',marginTop:'3px',lineHeight:1.5}}>{help}</div>}
      </div>
    )
  }

  const VARS = <div style={{fontSize:'9px',color:'var(--muted)',marginTop:'-8px',marginBottom:'10px',lineHeight:1.7,background:'var(--dim)',borderRadius:'6px',padding:'5px 7px'}}>
    <strong>Variables:</strong> {'{name} {phone} {email} {agent} {addr} {price} {gci} {status} {stage} {source} {type}'}
  </div>

  switch(node.type) {
    // Triggers
    case 'trigger_new_contact':      return <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.7,background:'var(--dim)',borderRadius:'8px',padding:'9px'}}>Fires whenever a new contact is added to TargetOS — manually, via import, or from a lead form.</div>
    case 'trigger_contact_status':   return <>{F('From Status','fromStatus','text',CONTACT_STATUSES)}{F('To Status','toStatus','text',CONTACT_STATUSES)}</>
    case 'trigger_no_activity':      return <>{F('Days of No Activity','days','number',null,'5')}{F('Apply To','applyTo','text',['All Contacts',...CONTACT_STATUSES])}</>
    case 'trigger_birthday':         return <>{F('Days Before Birthday','daysBefore','number',null,'3')}</>
    case 'trigger_anniversary':      return <>{F('Days Before Anniversary','daysBefore','number',null,'7')}</>
    case 'trigger_deal_stage':       return <>{F('New Stage (Production board)','stage','text',DEAL_STAGES,'','Column: Stage')}</>
    case 'trigger_offer_accepted':   return <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.7,background:'var(--dim)',borderRadius:'8px',padding:'9px'}}>Fires when Stage column → <strong>"Offer Accapted"</strong> on Production board.<br/>Monday Column: <code>status</code> (Stage)</div>
    case 'trigger_under_shtar':      return <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.7,background:'var(--dim)',borderRadius:'8px',padding:'9px'}}>Fires when Stage column → <strong>"Under Shtar"</strong>.<br/>Monday Column: <code>status</code> (Stage)</div>
    case 'trigger_under_contract':   return <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.7,background:'var(--dim)',borderRadius:'8px',padding:'9px'}}>Fires when Stage column → <strong>"Under Contract"</strong>.<br/>Monday Column: <code>status</code> (Stage)</div>
    case 'trigger_deal_closed':      return <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.7,background:'var(--dim)',borderRadius:'8px',padding:'9px'}}>Fires when Stage column → <strong>"Closed"</strong>.<br/>Monday Column: <code>status</code> (Stage)</div>
    case 'trigger_deal_fell':        return <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.7,background:'var(--dim)',borderRadius:'8px',padding:'9px'}}>Fires when Stage column → <strong>"Deal Fell Through"</strong>.<br/>Monday Column: <code>status</code> (Stage)</div>
    case 'trigger_ctc_change':       return <>{F('CTC Stage (Production board)','ctcStage','text',DEAL_CTC,'','Column: Contract to close (color_mkqr8y3h)')}</>
    case 'trigger_commission':       return <>{F('Commission Column','field','text',['Commission Received','Agent Commission Sent'])}{F('Changes To','status','text',COMMISSION_STATUS)}</>
    case 'trigger_listing_status':   return <>{F('New Status (Listings board)','status','text',LISTING_STATUSES,'','Column: status')}</>
    case 'trigger_listing_active':   return <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.7,background:'var(--dim)',borderRadius:'8px',padding:'9px'}}>Fires when Listing Status → <strong>"Active"</strong>.<br/>Monday Column: <code>status</code></div>
    case 'trigger_listing_ao':       return <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.7,background:'var(--dim)',borderRadius:'8px',padding:'9px'}}>Fires when Listing Status → <strong>"Accepted offer"</strong>.<br/>Monday Column: <code>status</code></div>
    case 'trigger_listing_sold':     return <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.7,background:'var(--dim)',borderRadius:'8px',padding:'9px'}}>Fires when Listing Status → <strong>"Sold"</strong>.<br/>Monday Column: <code>status</code></div>
    case 'trigger_new_listing':      return <>{F('Group','group','text',LISTING_GROUPS,'','Only fire when item added to this group')}</>
    case 'trigger_oh_visitor':       return <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.7,background:'var(--dim)',borderRadius:'8px',padding:'9px'}}>Fires when a visitor signs in at any open house in TargetOS.</div>
    case 'trigger_showing':          return <>{F('Interest Level','interest','text',['Any','Hot','Warm','Cold','No Interest'])}</>
    case 'trigger_task_overdue':     return <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.7,background:'var(--dim)',borderRadius:'8px',padding:'9px'}}>Fires when a task passes its due date without being completed.</div>
    case 'trigger_task_due':         return <>{F('Days Before Due','daysBefore','number',null,'1')}</>
    case 'trigger_scheduled':        return <>{F('Frequency','freq','text',['Daily','Weekly','Monthly','Every Monday','Every Sunday'])}{F('Time (ET)','time','time',null,'09:00')}</>
    // Actions
    case 'action_sms':               return <>{F('Send To','to','text',['contact','assigned_agent',...AGENTS])}{F('Message','message','textarea',null,'Hi {name}...')}{VARS}</>
    case 'action_email':             return <>{F('Send To','to','text',['contact','assigned_agent',...AGENTS])}{F('Subject','subject','text',null,'Message from Target Team')}{F('Body','body','textarea',null,'Hi {name}...')}{VARS}</>
    case 'action_whatsapp':          return <>{F('Send To','to','text',['contact','assigned_agent',...AGENTS])}{F('Message','message','textarea',null,'Hi {name}...')}<div style={{fontSize:'9px',color:'#D97706',marginBottom:'10px',background:'#FFFBEB',borderRadius:'6px',padding:'6px 8px',border:'1px solid #FCD34D'}}>⚠ Requires WhatsApp Business Meta verification</div>{VARS}</>
    case 'action_notify_agent':      return <>{F('Notify','to','text',['assigned_agent',...AGENTS])}{F('Message','message','textarea',null,'Heads up: {name} needs attention')}{VARS}</>
    case 'action_announce':          return <>{F('Title','title','text',null,'🏆 {agent} closed {addr}!')}{F('Body','body','textarea',null,'Congratulations!')}{VARS}</>
    case 'action_celebrate':         return <>{F('Message','message','textarea',null,'🎉 {agent} closed {addr} at {price}!')}{VARS}</>
    case 'action_task':              return <>{F('Task Title','title','text',null,'Follow up with {name}')}{F('Assign To','assignTo','text',['assigned_agent','Gitty Fogel',...AGENTS])}{F('Priority','priority','text',['normal','high','urgent'])}{F('Due In','dueIn','text',['same day','1 day','2 days','3 days','5 days','1 week','2 weeks'])}</>
    case 'action_assign_contact':    return <>{F('Assign To','agent','text',AGENTS)}</>
    case 'action_contact_status':    return <>{F('New Status','status','text',CONTACT_STATUSES)}</>
    case 'action_tag_contact':       return <>{F('Tag Name','tag','text',null,'VIP')}{F('Action','action','text',['Add Tag','Remove Tag'])}</>
    case 'action_deal_stage':        return <>{F('New Stage','stage','text',DEAL_STAGES,'','Updates Production board Stage column (id: status)')}</>
    case 'action_deal_ctc':          return <>{F('CTC Stage','ctcStage','text',DEAL_CTC,'','Updates Production board Contract to close column (id: color_mkqr8y3h)')}</>
    case 'action_listing_status':    return <>{F('New Status','status','text',LISTING_STATUSES,'','Updates Listings board Status column (id: status)')}</>
    case 'action_send_sign':         return <>{F('Sign Type','signType','text',SIGN_STATUS,'','Updates Production board Sign column (id: label3)')}</>
    case 'action_commission_status': return <>{F('Column','field','text',['Commission Received','Agent Commission Sent'],'','Column ids: status_16 / status_10')}{F('New Status','status','text',COMMISSION_STATUS)}</>
    case 'action_webhook':           return <>{F('URL','url','text',null,'https://...')}{F('Method','method','text',['POST','GET'])}{F('Body (JSON)','body','textarea',null,'{"event":"{type}","addr":"{addr}"}')} </>
    // Rules
    case 'rule_wait':                return <>{F('Duration','duration','number',null,'1')}{F('Unit','unit','text',['minutes','hours','days','weeks'])}</>
    case 'rule_condition':           return <>{F('Field','field','text',['status','stage','ctc_stage','source','assigned_agent','budget_max','role','tag','side'])}{F('Operator','operator','text',['equals','not equals','contains','in','is empty','is not empty','greater than','less than'])}{F('Value(s)','value','text',null,'Hot,Active','Comma-separate multiple values')}</>
    case 'rule_ab_split':            return <>{F('Group A %','pctA','number',null,'50')}{F('Group B %','pctB','number',null,'50')}<div style={{fontSize:'9px',color:'var(--muted)'}}>Creates two branches: A and B for split testing</div></>
    case 'rule_time_window':         return <>{F('Days','days','text',['Weekdays only (Mon-Fri)','Mon-Thu','All days'])}{F('From (ET)','from','time',null,'09:00')}{F('To (ET)','to','time',null,'18:00')}</>
    case 'rule_goal':                return <>{F('Goal Field','field','text',['status','stage'])}{F('Goal Value','value','text',null,'Active')}<div style={{fontSize:'9px',color:'var(--muted)',marginTop:'-8px',marginBottom:'10px'}}>Contact exits flow if this condition is already met</div></>
    case 'rule_exit':                return <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.7,background:'var(--dim)',borderRadius:'8px',padding:'9px'}}>Contact exits the automation here. No further actions are taken.</div>
    default:                         return <div style={{fontSize:'11px',color:'var(--muted)'}}>No configuration needed for this step.</div>
  }
}
