// TargetOS V2 — Fill Offer For Sale PDF with text annotations
// Works on Vercel serverless — pure Node.js, no Python
// Uses pdf-lib to add text annotations over the original form
'use strict'

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib')
const fs   = require('fs')
const path = require('path')

const TEMPLATE = path.join(__dirname, 'Offer_For_Sale_Form.pdf')

// PDF is 612x792. All boxes: [left, bottom, right, top]
// Derived from visual analysis of the actual form image (772x1000 px)
// Field boxes calibrated from actual filled PDF pixel measurements
// Format: [left, bottom, right, top] in PDF points (612x792)
const FIELD_BOXES = {
  date_month:        [369.4, 670.8, 391.6, 681.1],
  date_day:          [395.6, 670.8, 417.8, 681.1],
  date_year:         [420.2, 670.8, 455.0, 681.1],
  address:           [65.8,  645.5, 422.5, 655.0],
  mls_id:            [447.9, 645.5, 568.4, 655.0],
  buyer:             [57.9,  607.5, 287.8, 617.0],
  seller:            [274.3, 607.5, 512.1, 617.0],
  co_buyer:          [57.9,  590.8, 287.8, 600.3],
  co_seller:         [274.3, 590.8, 512.1, 600.3],
  purchase_price:    [158.5, 563.1, 241.8, 572.6],
  deposit:           [158.5, 552.0, 241.8, 561.5],
  concession:        [158.5, 540.9, 241.8, 550.4],
  net_to_seller:     [158.5, 530.6, 241.8, 540.1],
  mortgage_amt:      [158.5, 519.6, 241.8, 529.1],
  mortgage_pct:      [158.5, 509.3, 241.8, 518.8],
  balance:           [158.5, 499.0, 241.8, 508.5],
  closing_days:      [158.5, 488.7, 253.7, 498.2],
  terms1:            [117.3, 468.1, 569.2, 477.6],
  terms2:            [31.7,  457.0, 578.7, 466.5],
  terms3:            [31.7,  445.9, 578.7, 455.4],
  broker_name:       [214.0, 409.5, 418.6, 419.0],
  buyers_agent_pct:  [321.9, 400.8, 349.6, 410.3],
  sellers_agent_pct: [415.4, 400.8, 443.1, 410.3],
  sellers_agent:     [86.4,  352.4, 286.2, 361.9],
  buyers_agent:      [293.3, 352.4, 493.1, 361.9],
  purch_name:        [69.0,  320.0, 298.9, 329.5],
  purch_address:     [69.0,  305.7, 268.7, 315.2],
  purch_tel:         [69.0,  291.5, 268.7, 301.0],
  purch_email:       [69.0,  281.2, 268.7, 290.7],
  sell_name:         [311.5, 320.0, 541.4, 329.5],
  sell_address:      [311.5, 305.7, 511.3, 315.2],
  sell_tel:          [311.5, 291.5, 511.3, 301.0],
  sell_email:        [311.5, 281.2, 511.3, 290.7],
  cb_attorney:       [282.2, 550.4, 290.1, 558.4],
  cb_clear_title:    [282.2, 538.6, 290.1, 546.5],
  cb_mortgage:       [282.2, 526.7, 290.1, 534.6],
  cb_cash:           [282.2, 516.4, 290.1, 524.3],
  cb_inspection:     [282.2, 505.3, 290.1, 513.2],
  cb_structural:     [282.2, 494.2, 290.1, 502.1],
}

function fmtMoney(v) {
  if (!v && v !== 0) return ''
  const n = parseFloat(String(v).replace(/[$,%]/g,''))
  if (isNaN(n)) return ''
  return n.toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0})
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
  return [String(parseInt(m[2])), String(parseInt(m[3])), m[1]].slice(-2)[0] // just last 2 of year
  // Actually return full parts:
}

function getDateParts(s) {
  if (!s) return ['','','']
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ['','','']
  return [String(parseInt(m[2])), String(parseInt(m[3])), m[1].slice(2)] // month, day, YY
}

function splitTerms(text, maxLen = 90) {
  if (!text) return ['','','']
  const words = text.split(' ')
  const lines = []
  let cur = ''
  for (const w of words) {
    const test = (cur+' '+w).trim()
    if (test.length <= maxLen) cur = test
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  while (lines.length < 3) lines.push('')
  return lines.slice(0,3)
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  let data = {}
  try {
    const raw = await new Promise((ok,err) => {
      let d = ''
      req.on('data', c => d += c)
      req.on('end', () => ok(d))
      req.on('error', err)
    })
    data = JSON.parse(raw || '{}')
  } catch { data = req.body || {} }

  try {
    const templateBytes = fs.readFileSync(TEMPLATE)
    const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true })
    const font   = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const page   = pdfDoc.getPages()[0]

    const buyers_agent = data.buyers_agent_name || ''
    const [dMonth, dDay, dYear] = getDateParts(data.offer_date || '')
    const terms = splitTerms(data.additional_terms || '')

    // All text to draw: [box_key, text, fontSize]
    const texts = [
      ['date_month',       dMonth,    9],
      ['date_day',         dDay,      9],
      ['date_year',        dYear,     9],
      ['address',          data.listing_addr || '',           9],
      ['mls_id',           data.mls_number   || '',           9],
      ['buyer',            data.buyer_name   || '',           9],
      ['seller',           data.seller_name  || '',           9],
      ['co_buyer',         data.co_buyer_name  || '',         9],
      ['co_seller',        data.co_seller_name || '',         9],
      ['purchase_price',   fmtMoney(data.purchase_price),     9],
      ['deposit',          fmtDeposit(data.deposit, data.deposit_type), 9],
      ['concession',       fmtMoney(data.sellers_concession), 9],
      ['net_to_seller',    fmtMoney(data.net_to_seller),      9],
      ['mortgage_amt',     fmtMoney(data.mortgage_amount),    9],
      ['mortgage_pct',     data.mortgage_pct ? String(data.mortgage_pct).replace('%','')+'%' : '', 9],
      ['balance',          fmtDeposit(data.balance_at_closing, data.balance_type || 'dollar'), 9],
      ['closing_days',     String(data.closing_days || ''),   9],
      ['terms1',           terms[0],  8],
      ['terms2',           terms[1],  8],
      ['terms3',           terms[2],  8],
      ['broker_name',      buyers_agent, 9],
      ['buyers_agent_pct', data.buyers_agent_commission  || data.commission_pct || '', 9],
      ['sellers_agent_pct',data.sellers_agent_commission || '', 9],
      ['sellers_agent',    data.sellers_agent_name || '',     9],
      ['buyers_agent',     buyers_agent,                      9],
      ['purch_name',       data.purchaser_attorney_name    || '', 9],
      ['purch_address',    data.purchaser_attorney_address || '', 8],
      ['purch_tel',        data.purchaser_attorney_tel     || '', 9],
      ['purch_email',      data.purchaser_attorney_email   || '', 8],
      ['sell_name',        data.seller_attorney_name    || '', 9],
      ['sell_address',     data.seller_attorney_address || '', 8],
      ['sell_tel',         data.seller_attorney_tel     || '', 9],
      ['sell_email',       data.seller_attorney_email   || '', 8],
    ]

    // Draw text in each field box
    for (const [key, text, size] of texts) {
      if (!text || !FIELD_BOXES[key]) continue
      const [x0, y0, x1, y1] = FIELD_BOXES[key]
      const textY = y0 + 1.5  // just above bottom of box
      // Clip text to box width
      const maxW  = x1 - x0 - 2
      let drawn   = text
      while (drawn.length > 0 && font.widthOfTextAtSize(drawn, size) > maxW) {
        drawn = drawn.slice(0, -1)
      }
      page.drawText(drawn, {
        x: x0 + 1,
        y: textY,
        size,
        font,
        color: rgb(0,0,0),
      })
    }

    // Draw checkboxes as filled X
    const checkboxMap = [
      ['cb_attorney',    !!data.subject_attorney],
      ['cb_clear_title', !!data.subject_clear_title],
      ['cb_mortgage',    !!data.subject_mortgage],
      ['cb_cash',        !!data.subject_cash],
      ['cb_inspection',  !!data.subject_standard_inspection],
      ['cb_structural',  !!data.subject_structural],
    ]
    for (const [key, checked] of checkboxMap) {
      if (!checked || !FIELD_BOXES[key]) continue
      const [x0, y0, x1, y1] = FIELD_BOXES[key]
      const cx = (x0+x1)/2, cy = (y0+y1)/2, r = 3.5
      // Draw X
      page.drawLine({ start:{x:cx-r,y:cy-r}, end:{x:cx+r,y:cy+r}, thickness:1.5, color:rgb(0,0,0) })
      page.drawLine({ start:{x:cx+r,y:cy-r}, end:{x:cx-r,y:cy+r}, thickness:1.5, color:rgb(0,0,0) })
    }

    const pdfBytes = await pdfDoc.save()
    const addr = (data.listing_addr || 'offer').replace(/[^a-z0-9]/gi,'_').slice(0,40)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="Offer_${addr}.pdf"`)
    res.setHeader('Content-Length', pdfBytes.length)
    res.status(200).end(Buffer.from(pdfBytes))
  } catch(e) {
    console.error('PDF error:', e.message)
    res.status(500).json({ error: e.message })
  }
}
