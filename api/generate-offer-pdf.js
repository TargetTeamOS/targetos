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
const FIELD_BOXES = {
  date_month:       [369.4, 670.8, 391.6, 681.1],
  date_day:         [395.6, 670.8, 417.8, 681.1],
  date_year:        [420.2, 670.8, 455.8, 681.1],
  address:          [65.8,  645.5, 440.0, 655.0],
  mls_id:           [505.0, 645.5, 575.0, 655.0],
  buyer:            [57.9,  609.0, 291.7, 618.6],
  seller:           [274.3, 609.0, 512.1, 618.6],
  co_buyer:         [57.9,  592.4, 291.7, 601.9],
  co_seller:        [274.3, 592.4, 512.1, 601.9],
  purchase_price:   [150.0, 564.7, 270.0, 574.2],
  deposit:          [150.0, 554.4, 270.0, 563.9],
  concession:       [150.0, 543.3, 270.0, 552.8],
  net_to_seller:    [150.0, 532.2, 270.0, 541.7],
  mortgage_amt:     [150.0, 521.1, 270.0, 530.6],
  mortgage_pct:     [150.0, 510.8, 270.0, 520.3],
  balance:          [150.0, 499.8, 270.0, 509.3],
  closing_days:     [150.0, 489.5, 270.0, 499.0],
  terms1:           [117.3, 468.9, 569.2, 478.4],
  terms2:           [31.7,  457.8, 570.8, 467.3],
  terms3:           [31.7,  445.9, 570.8, 455.4],
  broker_name:      [214.0, 411.0, 418.0, 420.6],
  buyers_agent_pct: [398.0, 401.5, 435.0, 411.8],
  sellers_agent_pct:[510.0, 401.5, 550.0, 411.8],
  sellers_agent:    [87.2,  354.0, 285.4, 363.5],
  buyers_agent:     [293.3, 354.0, 500.0, 363.5],
  purch_name:       [69.8,  322.3, 299.7, 331.8],
  purch_address:    [69.8,  306.5, 280.0, 316.0],
  purch_tel:        [69.8,  290.7, 280.0, 300.2],
  purch_email:      [69.8,  279.0, 280.0, 289.0],
  sell_name:        [315.0, 322.3, 545.0, 331.8],
  sell_address:     [315.0, 306.5, 545.0, 316.0],
  sell_tel:         [315.0, 290.7, 545.0, 300.2],
  sell_email:       [315.0, 279.0, 545.0, 289.0],
  // Checkbox X positions (drawn as filled X)
  cb_attorney:      [282.0, 550.4, 292.0, 560.0],
  cb_clear_title:   [282.0, 538.6, 292.0, 548.2],
  cb_mortgage:      [282.0, 526.7, 292.0, 536.3],
  cb_cash:          [282.0, 515.6, 292.0, 525.2],
  cb_inspection:    [282.0, 504.5, 292.0, 514.1],
  cb_structural:    [282.0, 493.4, 292.0, 503.0],
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
