// TargetOS V2 — Fill Offer For Sale PDF using named form fields
// Uses the Acrobat-prepared PDF with 37 named fields — zero coordinate guessing
'use strict'

const { PDFDocument } = require('pdf-lib')
const fs   = require('fs')
const path = require('path')
const { requireAnyAgent } = require('./_lib/phone')

const TEMPLATE = path.join(__dirname, 'Offer_For_Sale_Form.pdf')

function fmtMoney(v) {
  if (!v) return ''
  const n = parseFloat(String(v).replace(/[$,%]/g,''))
  if (isNaN(n)) return ''
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits:0 })
}

function fmtDeposit(v, type) {
  if (!v) return ''
  const n = parseFloat(String(v).replace(/[$,%]/g,''))
  if (isNaN(n)) return ''
  return type === 'percent' ? n + '%' : fmtMoney(n)
}

function datePart(s, p) {
  if (!s) return ''
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  return [String(parseInt(m[2])), String(parseInt(m[3])), m[1].slice(2)][p]
}

module.exports = async function handler(req, res) {
  // HARDENED (July 2026): caller authentication with staged rollout,
  // same pattern as TWILIO_SIG_ENFORCE. Log-only until AUTH_ENFORCE
  // is set to 'true' in Vercel — watch logs for '[AUTH]' lines, flip
  // the env var when clean. Kill-switch: set it back to 'false'.
  const { requireUser } = require('./_lib/auth')
  const __user = await requireUser(req)
  if (!__user) {
    if (String(process.env.AUTH_ENFORCE || '').toLowerCase() === 'true') {
      console.warn('[AUTH] BLOCKED unauthenticated call to ' + req.url)
      res.statusCode = 401; res.setHeader('Content-Type','application/json'); return res.end(JSON.stringify({ error: 'unauthorized' }))
    }
    console.warn('[AUTH] unauthenticated call to ' + req.url + ' ALLOWED (log-only — set AUTH_ENFORCE=true in Vercel to block)')
  }
  if (req.method !== 'POST') return res.status(405).json({ error:'POST only' })

  const authCheck = await requireAnyAgent(req)
  if (!authCheck.ok) return res.status(authCheck.status).json({ error: authCheck.message })

  let data = {}
  try {
    const raw = await new Promise((ok,err) => {
      let d = ''
      req.on('data', c => d += c)
      req.on('end', () => ok(d))
      req.on('error', err)
    })
    data = JSON.parse(raw || '{}')
  } catch { data = {} }

  try {
    const bytes  = fs.readFileSync(TEMPLATE)
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const form   = pdfDoc.getForm()

    function set(name, val) {
      try { form.getTextField(name).setText(String(val || '')) } catch(e) {}
    }

    const buyers_agent = data.buyers_agent_name || ''

    // ── DATE ─────────────────────────────────────────────────────
    set('date_month', datePart(data.offer_date, 0))
    set('date_day',   datePart(data.offer_date, 1))
    set('date_year',  datePart(data.offer_date, 2))

    // ── PROPERTY ─────────────────────────────────────────────────
    set('address', data.listing_addr || '')
    set('mls_id',  data.mls_number   || '')

    // ── BUYER / SELLER ────────────────────────────────────────────
    set('buyer',    data.buyer_name     || '')
    set('co_buyer', data.co_buyer_name  || '')
    set('seller',   data.seller_name    || '')
    set('co_seller',data.co_seller_name || '')

    // ── FINANCIALS ────────────────────────────────────────────────
    set('purchase_price', fmtMoney(data.purchase_price))
    set('deposit',        fmtDeposit(data.deposit, data.deposit_type))
    set('concession',     fmtMoney(data.sellers_concession))
    set('net_to_seller',  fmtMoney(data.net_to_seller))
    set('mortgage_amt',   fmtMoney(data.mortgage_amount))
    set('mortgage_pct',   data.mortgage_pct ? String(data.mortgage_pct).replace('%','') + '%' : '')
    set('balance',        fmtDeposit(data.balance_at_closing, data.balance_type || 'dollar'))
    set('closing_days',   data.closing_days ? String(data.closing_days) : '')

    // ── TERMS ─────────────────────────────────────────────────────
    set('terms1', data.additional_terms || '')

    // ── BROKERAGE ─────────────────────────────────────────────────
    set('sellers_agent_broker_company',  data.seller_agent_company || '')
    set('buyers_agnet_commissionn_pct',  data.buyers_agent_commission || data.commission_pct || '')
    set('sellers_agent_commissionn_pct', data.sellers_agent_commission || '')
    set('Sellers_broker_name',           data.sellers_agent_name  || '')
    set('Buyers_broker_name',            buyers_agent)

    // ── ATTORNEYS ─────────────────────────────────────────────────
    set('purch_name',    data.purchaser_attorney_name    || '')
    set('purch_address', data.purchaser_attorney_address || '')
    set('purch_tel',     data.purchaser_attorney_tel     || '')
    set('purch_email',   data.purchaser_attorney_email   || '')
    set('sell_name',     data.seller_attorney_name    || '')
    set('sell_address',  data.seller_attorney_address || '')
    set('sell_tel',      data.seller_attorney_tel     || '')
    set('sell_email',    data.seller_attorney_email   || '')

    // Flatten so values show in all PDF viewers
    form.flatten()

    const pdfBytes = await pdfDoc.save()
    const addr = (data.listing_addr || 'offer').replace(/[^a-z0-9]/gi,'_').slice(0,40)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="Offer_' + addr + '.pdf"')
    res.setHeader('Content-Length', pdfBytes.length)
    res.status(200).end(Buffer.from(pdfBytes))
  } catch(e) {
    console.error('PDF error:', e.message)
    res.status(500).json({ error: e.message })
  }
}
