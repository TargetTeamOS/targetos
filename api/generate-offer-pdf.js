// TargetOS V2 — Fill Offer For Sale PDF
// Uses pdf-lib (Node.js) to fill the original Target Team PDF form.
// No Python dependency — works on Vercel serverless.
'use strict'

const { PDFDocument } = require('pdf-lib')
const fs   = require('fs')
const path = require('path')

const TEMPLATE_PATH = path.join(__dirname, 'Offer_For_Sale_Form.pdf')

function fmtMoney(v) {
  if (!v && v !== 0) return ''
  const n = parseFloat(String(v).replace(/[$,%]/g, ''))
  if (isNaN(n)) return ''
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtDeposit(v, type) {
  // type: 'dollar' or 'percent'
  if (!v) return ''
  const n = parseFloat(String(v).replace(/[$,%]/g, ''))
  if (isNaN(n)) return ''
  return type === 'percent' ? n + '%' : fmtMoney(n)
}

function datePart(dateStr, part) {
  // part: 0=month, 1=day, 2=year
  if (!dateStr) return ''
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  return [String(parseInt(m[2])), String(parseInt(m[3])), m[1]][part]
}

function splitTerms(text, maxLen = 88) {
  if (!text) return ['', '', '']
  const words = text.split(' ')
  const lines = []
  let cur = ''
  for (const w of words) {
    const test = (cur + ' ' + w).trim()
    if (test.length <= maxLen) { cur = test }
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  while (lines.length < 3) lines.push('')
  return lines.slice(0, 3)
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  let data = {}
  try {
    const raw = await new Promise((ok, err) => {
      let d = ''
      req.on('data', c => { d += c })
      req.on('end', () => ok(d))
      req.on('error', err)
    })
    data = JSON.parse(raw || '{}')
  } catch { data = req.body || {} }

  try {
    const templateBytes = fs.readFileSync(TEMPLATE_PATH)
    const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true })
    const form   = pdfDoc.getForm()

    const buyers_agent = data.buyers_agent_name || ''
    const commission   = data.commission_pct ? String(data.commission_pct).replace('%','') + '%' : ''
    const terms        = splitTerms(data.additional_terms || '')

    // Helper — set field safely
    function setField(name, value) {
      try {
        const field = form.getTextField(name)
        field.setText(String(value || ''))
      } catch(e) {
        // field not found or wrong type — skip silently
      }
    }

    function setCheck(name, checked) {
      try {
        const field = form.getCheckBox(name)
        checked ? field.check() : field.uncheck()
      } catch(e) {}
    }

    // ── DATE ──────────────────────────────────────────────────────
    setField('Date',        datePart(data.offer_date, 0))
    setField('undefined',   datePart(data.offer_date, 1))
    setField('undefined_2', datePart(data.offer_date, 2))

    // ── PROPERTY ──────────────────────────────────────────────────
    setField('Address', data.listing_addr || '')
    setField('MLS ID',  data.mls_number   || '')

    // ── BUYER / SELLER ────────────────────────────────────────────
    setField('Buyer',    data.buyer_name      || '')
    setField('Seller',   data.seller_name     || '')
    setField('CoBuyer',  data.co_buyer_name   || '')
    setField('CoSeller', data.co_seller_name  || '')

    // ── FINANCIALS ────────────────────────────────────────────────
    setField('undefined_3', fmtMoney(data.purchase_price))
    // Deposit can be $ or %
    setField('undefined_4', fmtDeposit(data.deposit, data.deposit_type || 'dollar'))
    setField('undefined_5', fmtMoney(data.sellers_concession))
    setField('undefined_6', fmtMoney(data.net_to_seller))
    setField('undefined_7', fmtMoney(data.mortgage_amount))
    setField('undefined_8', data.mortgage_pct ? String(data.mortgage_pct).replace('%','') + '%' : '')
    setField('undefined_9', fmtMoney(data.balance_at_closing))
    setField('DAYS',        String(data.closing_days || '30'))

    // ── ADDITIONAL TERMS ──────────────────────────────────────────
    setField('Additional Terms 1', terms[0])
    setField('Additional Terms 2', terms[1])
    setField('Additional Terms 3', terms[2])

    // ── BROKER PARAGRAPH ─────────────────────────────────────────
    setField('The seller recognizes Keller Williams Valley Realty LTD and', buyers_agent)
    setField('effected this meeting of the minds and agrees to pay a brokerage commission of', commission)

    // ── AGENTS ────────────────────────────────────────────────────
    setField('Sellers Agent', data.sellers_agent_name || '')
    setField('Buyers Agent',  buyers_agent)

    // ── PURCHASER'S ATTORNEY ─────────────────────────────────────
    setField('Name',      data.purchaser_attorney_name    || '')
    setField('Address_2', data.purchaser_attorney_address || '')
    setField('Tel',       data.purchaser_attorney_tel     || '')
    setField('Email',     data.purchaser_attorney_email   || '')

    // ── SELLER'S ATTORNEY ─────────────────────────────────────────
    setField('Name_2',    data.seller_attorney_name    || '')
    setField('Address_3', data.seller_attorney_address || '')
    setField('Tel_2',     data.seller_attorney_tel     || '')
    setField('Email_2',   data.seller_attorney_email   || '')

    // ── CHECKBOXES ────────────────────────────────────────────────
    setCheck('Check Box1', !!data.subject_attorney)
    setCheck('Check Box2', !!data.subject_clear_title)
    setCheck('Check Box3', !!data.subject_mortgage)
    setCheck('Check Box4', !!data.subject_cash)
    setCheck('Check Box5', !!data.subject_standard_inspection)
    setCheck('Check Box6', !!data.subject_structural)

    // Flatten form so values show in all PDF viewers
    form.flatten()

    const pdfBytes = await pdfDoc.save()
    const addr = (data.listing_addr || 'offer').replace(/[^a-z0-9]/gi, '_').slice(0, 40)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="Offer_${addr}.pdf"`)
    res.setHeader('Content-Length', pdfBytes.length)
    res.status(200).end(Buffer.from(pdfBytes))
  } catch(e) {
    console.error('PDF generation error:', e.message, e.stack)
    res.status(500).json({ error: e.message })
  }
}
