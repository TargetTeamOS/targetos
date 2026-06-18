// Vercel Serverless Function — proxies email sending to Resend
// This runs on the server so CORS and API keys are not exposed
export default async function handler(req, res) {
  // Allow CORS from our app
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if(req.method === 'OPTIONS') { res.status(200).end(); return }
  if(req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const RESEND_KEY = process.env.RESEND_API_KEY || 're_ShsDysNB_2MDVrReA864LkDRGCgbadc93'

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    })

    const data = await response.json()

    if(!response.ok) {
      console.error('Resend error:', data)
      return res.status(response.status).json({ error: data.message || 'Send failed', details: data })
    }

    return res.status(200).json({ success: true, id: data.id })
  } catch(err) {
    console.error('Email proxy error:', err)
    return res.status(500).json({ error: err.message })
  }
}
