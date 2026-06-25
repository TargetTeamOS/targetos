// /api/twilio-voicemail — Voicemail recording + transcription callback
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { CallSid, RecordingUrl, RecordingDuration, TranscriptionText, From } = req.body || {}
  try {
    // Find original call
    const { data: call } = await supabase.from('calls').select('*').eq('twilio_call_sid', CallSid).maybeSingle()

    // Update call record
    if (call?.id) {
      await supabase.from('calls').update({
        is_voicemail:          true,
        voicemail_url:         RecordingUrl ? RecordingUrl + '.mp3' : null,
        voicemail_transcript:  TranscriptionText || null,
        outcome:               'Voicemail',
      }).eq('id', call.id)
    }

    // Look up contact
    const cleanPhone = (From || '').replace(/\D/g, '').slice(-10)
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, agent_id')
      .or(`phone.ilike.%${cleanPhone}%`)
      .maybeSingle()

    // Save to voicemails table
    await supabase.from('voicemails').insert({
      call_id:       call?.id || null,
      agent_id:      contact?.agent_id || null,
      from_number:   From || null,
      contact_id:    contact?.id || null,
      contact_name:  contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : null,
      recording_url: RecordingUrl ? RecordingUrl + '.mp3' : null,
      transcript:    TranscriptionText || null,
      duration_sec:  parseInt(RecordingDuration) || 0,
      is_read:       false,
      created_at:    new Date().toISOString(),
    })

    res.status(200).json({ ok: true })
  } catch(err) {
    console.error('twilio-voicemail error:', err)
    res.status(200).json({ ok: false })
  }
}
