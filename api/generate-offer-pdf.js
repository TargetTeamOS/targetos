// TargetOS V2 — Offer PDF Generator Endpoint
// POST /api/generate-offer-pdf
// Body: offer data JSON
// Returns: PDF binary
'use strict'

const { execSync, spawn } = require('child_process')
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

  const tmp = path.join(os.tmpdir(), 'offer_' + Date.now() + '.pdf')

  try {
    // Write data to temp JSON file for Python to read
    const jsonTmp = tmp + '.json'
    fs.writeFileSync(jsonTmp, JSON.stringify(body))

    // Run Python generator
    const script = path.join(__dirname, 'generate_offer_pdf.py')
    execSync(`python3 ${script} ${jsonTmp} ${tmp}`, { timeout: 30000 })

    const pdf = fs.readFileSync(tmp)
    const addr = (body.listing_addr || 'offer').replace(/[^a-z0-9]/gi, '_').slice(0, 40)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="Offer_${addr}.pdf"`)
    res.setHeader('Content-Length', pdf.length)
    res.status(200).end(pdf)
  } catch(e) {
    console.error('PDF generation error:', e.message)
    res.status(500).json({ error: e.message })
  } finally {
    try { fs.unlinkSync(tmp) } catch {}
    try { fs.unlinkSync(tmp + '.json') } catch {}
  }
}
