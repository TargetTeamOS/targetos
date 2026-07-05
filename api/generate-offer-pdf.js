// TargetOS V2 — Generate Filled Offer PDF
// POST /api/generate-offer-pdf  { ...offer data }
// Returns: filled PDF binary using the official Target Team form
'use strict'

const { execSync } = require('child_process')
const path = require('path')
const fs   = require('fs')
const os   = require('os')

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  let body = {}
  try {
    const raw = await new Promise((ok, err) => {
      let d = ''
      req.on('data', c => { d += c })
      req.on('end', () => ok(d))
      req.on('error', err)
    })
    body = JSON.parse(raw || '{}')
  } catch { body = req.body || {} }

  const jsonTmp = path.join(os.tmpdir(), 'offer_data_' + Date.now() + '.json')
  const pdfTmp  = path.join(os.tmpdir(), 'offer_out_'  + Date.now() + '.pdf')

  try {
    fs.writeFileSync(jsonTmp, JSON.stringify(body))

    const script = path.join(__dirname, 'fill_offer_pdf.py')
    execSync(`python3 "${script}" "${jsonTmp}" "${pdfTmp}"`, { timeout: 30000 })

    const pdf  = fs.readFileSync(pdfTmp)
    const addr = (body.listing_addr || 'offer').replace(/[^a-z0-9]/gi, '_').slice(0, 40)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="Offer_${addr}.pdf"`)
    res.setHeader('Content-Length', pdf.length)
    res.status(200).end(pdf)
  } catch(e) {
    console.error('PDF error:', e.message)
    res.status(500).json({ error: e.message })
  } finally {
    try { fs.unlinkSync(jsonTmp) } catch {}
    try { fs.unlinkSync(pdfTmp)  } catch {}
  }
}
