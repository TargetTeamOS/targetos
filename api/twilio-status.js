// /api/twilio-status — Call status + recording callbacks
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
)
export const config = { api: { bodyParser: true } }
const OUTCOME = { completed:'Connected', busy:'No Answer', 'no-answer':'No Answer', failed:'No Answer', canceled:'No Answer' }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { CallSid, CallStatus, CallDuration, RecordingUrl, RecordingSid } = req.body || {}
  try {
    const upd = { status: CallStatus, duration_sec: parseInt(CallDuration)||0, outcome: OUTCOME[CallStatus]||null }
    if (RecordingUrl) { upd.recording_url = RecordingUrl + '.mp3'; upd.recording_sid = RecordingSid }
    await supabase.from('calls').update(upd).eq('twilio_call_sid', CallSid)
    res.status(200).json({ ok: true })
  } catch(err) {
    console.error('twilio-status error:', err)
    res.status(200).json({ ok: false, error: err.message })
  }
}
