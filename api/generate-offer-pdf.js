// TargetOS V2 — Generate Filled Offer PDF
// Draws text directly onto the blank offer form at measured field positions.
// Coordinates derived from pdfplumber analysis of the actual blank form.
// Format: [x, y_pdf, maxWidth] — pdf-lib coordinate system (0,0 = bottom-left)
'use strict'

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib')
const fs   = require('fs')
const path = require('path')

const TEMPLATE = path.join(__dirname, 'Offer_For_Sale_Form.pdf')

// All positions measured from blank form using pdfplumber
// y values = 792 - pdfplumber_top_y
const FIELDS = {
  date_month:     [455, 639,  30],
  date_day:       [497, 639,  22],
  date_year:      [523, 639,  38],
  address:        [ 83, 606, 340],
  mls_id:         [455, 608, 110],
  buyer:          [ 80, 553, 230],
  seller:         [352, 554, 200],
  co_buyer:       [ 89, 525, 215],
  co_seller:      [365, 526, 190],
  purchase_price: [183, 499, 120],
  deposit:        [183, 484, 120],
  concession:     [183, 471, 120],
  net_to_seller:  [183, 457, 120],
  mortgage_amt:   [183, 445, 120],
  mortgage_pct:   [183, 435, 120],
  balance:        [183, 419, 120],
  closing_days:   [183, 405,  80],
  terms1:         [131, 379, 430],
  terms2:         [ 43, 370, 525],
  terms3:         [ 43, 361, 525],
  broker_name:    [300, 327, 180],
  commission_pct: [375, 315,  25],
  sellers_agent:  [119, 261, 185],
  buyers_agent:   [372, 261, 180],
  purch_name:     [ 90, 218, 220],
  purch_address:  [ 98, 198, 190],
  purch_tel:      [ 76, 178, 205],
  purch_email:    [ 94, 158, 200],
  sell_name:      [375, 218, 185],
  sell_address:   [383, 198, 175],
  sell_tel:       [361, 178, 198],
  sell_email:     [365, 158, 195],
}

// Checkbox positions [x, y_pdf] — draw filled square when checked
const CHECKBOXES = {
  cb_attorney:    [358, 489],
  cb_clear_title: [358, 474],
  cb_mortgage:    [358, 459],
  cb_cash:        [358, 444],
  cb_inspection:  [358, 429],
  cb_structural:  [358, 414],
}

function fmtMoney(v) {
  if (!v) return ''
  const n = parseFloat(String(v).replace(/[$,%]/g, ''))
  if (isNaN(n)) return ''
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function fmtDeposit(v, type) {
  if (!v) return ''
  const n = parseFloat(String(v).replace(/[$,%]/g, ''))
  if (isNaN(n)) return ''
  return type === 'percent' ? n + '%' : fmtMoney(n)
}

function fmtPct(v) {
  if (!v) return ''
  return String(v).replace(/[^0-9.]/g, '') + '%'
}

function datePart(s, part) {
  if (!s) return ''
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  return [String(parseInt(m[2])), String(parseInt(m[3])), m[1].slice(2)][part]
}

function splitTerms(text, font, maxW, size) {
  if (!text) return ['', '', '']
  const words = text.split(' ')
  const lines = []
  let cur = ''
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w
    if (font.widthOfTextAtSize(test, size) <= maxW) {
      cur = test
    } else {
      lines.push(cur)
      cur = w
    }
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
      req.on('data', c => d += c)
      req.on('end', () => ok(d))
      req.on('error', err)
    })
    data = JSON.parse(raw || '{}')
  } catch { data = {} }

  try {
    const templateBytes = fs.readFileSync(TEMPLATE)
    const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true })
    const font   = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontB  = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const page   = pdfDoc.getPages()[0]
    const BLACK  = rgb(0, 0, 0)
    const SIZE   = 9

    const buyers_agent = data.buyers_agent_name || ''
    const terms = splitTerms(data.additional_terms || '', font, 430, SIZE)

    // Map data to field keys
    const textFields = {
      date_month:     datePart(data.offer_date, 0),
      date_day:       datePart(data.offer_date, 1),
      date_year:      datePart(data.offer_date, 2),
      address:        data.listing_addr        || '',
      mls_id:         data.mls_number          || '',
      buyer:          data.buyer_name          || '',
      seller:         data.seller_name         || '',
      co_buyer:       data.co_buyer_name       || '',
      co_seller:      data.co_seller_name      || '',
      purchase_price: fmtMoney(data.purchase_price),
      deposit:        fmtDeposit(data.deposit, data.deposit_type),
      concession:     fmtMoney(data.sellers_concession),
      net_to_seller:  fmtMoney(data.net_to_seller),
      mortgage_amt:   fmtMoney(data.mortgage_amount),
      mortgage_pct:   data.mortgage_pct ? fmtPct(data.mortgage_pct) : '',
      balance:        fmtDeposit(data.balance_at_closing, data.balance_type || 'dollar'),
      closing_days:   data.closing_days        ? String(data.closing_days) : '',
      terms1:         terms[0],
      terms2:         terms[1],
      terms3:         terms[2],
      broker_name:    buyers_agent,
      commission_pct: data.buyers_agent_commission || data.commission_pct || '',
      sellers_agent:  data.sellers_agent_name  || '',
      buyers_agent:   buyers_agent,
      purch_name:     data.purchaser_attorney_name    || '',
      purch_address:  data.purchaser_attorney_address || '',
      purch_tel:      data.purchaser_attorney_tel     || '',
      purch_email:    data.purchaser_attorney_email   || '',
      sell_name:      data.seller_attorney_name    || '',
      sell_address:   data.seller_attorney_address || '',
      sell_tel:       data.seller_attorney_tel     || '',
      sell_email:     data.seller_attorney_email   || '',
    }

    // Draw each text field
    for (const [key, text] of Object.entries(textFields)) {
      if (!text || !FIELDS[key]) continue
      const [x, y, maxW] = FIELDS[key]
      // Truncate text to fit within field width
      let drawn = String(text)
      while (drawn.length > 0 && font.widthOfTextAtSize(drawn, SIZE) > maxW) {
        drawn = drawn.slice(0, -1)
      }
      if (!drawn) continue
      const isBold = key === 'purchase_price'
      page.drawText(drawn, {
        x, y,
        size:  SIZE,
        font:  isBold ? fontB : font,
        color: BLACK,
      })
    }

    // Draw checkboxes — filled square inside the box
    const checkMap = {
      cb_attorney:    !!data.subject_attorney,
      cb_clear_title: !!data.subject_clear_title,
      cb_mortgage:    !!data.subject_mortgage,
      cb_cash:        !!data.subject_cash,
      cb_inspection:  !!data.subject_standard_inspection,
      cb_structural:  !!data.subject_structural,
    }
    for (const [key, checked] of Object.entries(checkMap)) {
      if (!checked || !CHECKBOXES[key]) continue
      const [x, y] = CHECKBOXES[key]
      // Draw a checkmark ✓ inside the box
      // Draw filled square as checkmark (avoids WinAnsi encoding issue with ✓)
      page.drawRectangle({ x: x + 1, y: y + 1, width: 6, height: 6, color: BLACK })
    }

    const pdfBytes = await pdfDoc.save()
    const addr     = (data.listing_addr || 'offer').replace(/[^a-z0-9]/gi, '_').slice(0, 40)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="Offer_' + addr + '.pdf"')
    res.setHeader('Content-Length', pdfBytes.length)
    res.status(200).end(Buffer.from(pdfBytes))
  } catch(e) {
    console.error('PDF error:', e.message)
    res.status(500).json({ error: e.message })
  }
}
