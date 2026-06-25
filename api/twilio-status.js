// /api/twilio-status — Handles call status callbacks (completed, no-answer, busy)
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { CallSid, CallStatus, CallDuration, RecordingUrl, RecordingSid } = req.body || {}
  try {
    const statusMap = { completed:'completed', busy:'no-answer', 'no-answer':'no-answer', failed:'failed', canceled:'canceled' }
    const outcomeMap = { completed:'Connected', busy:'No Answer', 'no-answer':'No Answer', failed:'No Answer' }
    await supabase.from('calls').update({
      status:        statusMap[CallStatus] || CallStatus,
      outcome:       outcomeMap[CallStatus],
      duration_sec:  parseInt(CallDuration) || 0,
      recording_url: RecordingUrl || null,
      recording_sid: RecordingSid || null,
    }).eq('twilio_call_sid', CallSid)
    res.status(200).json({ ok: true })
  } catch(err) {
    console.error('twilio-status error:', err)
    res.status(200).json({ ok: false })
  }
}
