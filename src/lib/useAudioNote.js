// ═══════════════════════════════════════════════════════════════
// useAudioNote — records microphone audio (MediaRecorder) AND runs
// speech-to-text (SpeechRecognition) at the same time, so a saved
// note keeps BOTH the audio file and its transcript. Agents can play
// the recording back later if the transcript was inaccurate.
// ═══════════════════════════════════════════════════════════════

import { useRef, useState } from 'react'

export function useAudioNote() {
  const [recording, setRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [audioBlob, setAudioBlob] = useState(null)
  const [error, setError] = useState('')
  const mediaRec = useRef(null)
  const chunks = useRef([])
  const speechRec = useRef(null)
  const streamRef = useRef(null)

  async function start() {
    setError(''); setTranscript(''); setAudioBlob(null); chunks.current = []
    // 1) audio capture
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      mr.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        streamRef.current?.getTracks().forEach(t => t.stop())
      }
      mr.start()
      mediaRec.current = mr
    } catch (e) {
      setError('Microphone access denied'); return
    }
    // 2) transcript (best-effort; audio still saved if this fails)
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SR) {
      const sr = new SR()
      sr.lang = 'en-US'; sr.continuous = true; sr.interimResults = true
      let finalText = ''
      sr.onresult = e => {
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          if (e.results[i].isFinal) finalText += t + ' '; else interim += t
        }
        setTranscript((finalText + interim).trim())
      }
      sr.onerror = () => {}
      try { sr.start(); speechRec.current = sr } catch {}
    }
    setRecording(true)
  }

  function stop() {
    try { mediaRec.current?.stop() } catch {}
    try { speechRec.current?.stop() } catch {}
    setRecording(false)
  }

  function reset() { setTranscript(''); setAudioBlob(null); setError('') }

  return { recording, transcript, audioBlob, error, start, stop, reset, setTranscript }
}
