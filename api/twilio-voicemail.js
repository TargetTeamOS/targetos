// /api/twilio-voicemail — Handles voicemail recordings + transcripts
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { CallSid, RecordingUrl, RecordingDuration, TranscriptionText, From } = req.body || {}
  try {
    // Look up the original call
    const { data: call } = await supabase.from('calls').select('*').eq('twilio_call_sid', CallSid).maybeSingle()
    // Mark original call as voicemail
    if (call) {
      await supabase.from('calls').update({ is_voicemail: true, voicemail_url: RecordingUrl, voicemail_transcript: TranscriptionText || null }).eq('id', call.id)
    }
    // Also insert into voicemails table
    const cleanPhone = (From || '').replace(/\D/g, '').slice(-10)
    const { data: contact } = await supabase.from('contacts').select('id,first_name,last_name,agent_id').or(`phone.ilike.%${cleanPhone}%`).maybeSingle()
    await supabase.from('voicemails').insert({
      call_id:       call?.id || null,
      agent_id:      contact?.agent_id || null,
      from_number:   From,
      contact_id:    contact?.id || null,
      contact_name:  contact ? `${contact.first_name} ${contact.last_name || ''}`.trim() : null,
      recording_url: RecordingUrl,
      transcript:    TranscriptionText || null,
      duration_sec:  parseInt(RecordingDuration) || 0,
      is_read:       false,
    })
    res.status(200).json({ ok: true })
  } catch(err) {
    console.error('twilio-voicemail error:', err)
    res.status(200).json({ ok: false })
  }
}
