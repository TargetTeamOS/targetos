'use strict'
// Vercel Serverless Function — proxies email sending to Resend
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return }

  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) {
    console.error('[send-email] RESEND_API_KEY not set in environment variables')
    return res.status(500).json({ error: 'Email service not configured' })
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
      body:    JSON.stringify(req.body),
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Send failed' })
    return res.status(200).json({ success: true, id: data.id })
  } catch(err) {
    return res.status(500).json({ error: err.message })
  }
}
