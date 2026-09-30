import { useEffect, useRef, useState } from 'react'
import type { IngestInput, IngestResult } from '../types'
import { api } from '../api/client'
import { LANGUAGE_LABELS, TYPE_LABELS, relativeTime } from '../lib/format'
import Badge, { PriorityBadge } from './Badge'
import { BotIcon, CheckIcon, MicIcon, XIcon } from './icons'

interface ChatMessage {
  id: string
  role: 'user' | 'system'
  text?: string
  result?: IngestResult
  time: string
  pending?: boolean
}

const SAMPLES: Array<{ lang: 'en' | 'fr' | 'pidgin'; text: string }> = [
  {
    lang: 'en',
    text: 'A group of three men tried to force open the door of the pharmacy near the market around 7pm. They left when the siren sounded.',
  },
  {
    lang: 'fr',
    text: "Vers 21h, des coups de feu ont entendu près de l'école primaire. Deux personnes blessées transportées à l'hôpital.",
  },
  {
    lang: 'pidgin',
    text: 'Di wahala don plenty for dis area. Three boys wey wear mask don break person shop for main market this morning and dem run go.',
  },
]

const RECORD_FILE_NAME = 'voice-recording.webm'

function AiResultCard({ result }: { result: IngestResult }) {
  return (
    <div
      className={`w-full max-w-md rounded-2xl rounded-tl-sm border px-4 py-3 text-xs ${
        result.ai.processed
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-brand-200 bg-brand-50'
      }`}
    >
      <div className="flex items-center gap-2">
        {result.ai.processed ? (
          <CheckIcon size={14} className="shrink-0 text-emerald-600" />
        ) : (
          <span className="shrink-0 text-brand-600">⚠</span>
        )}
        <span className={`font-medium ${result.ai.processed ? 'text-emerald-700' : 'text-brand-700'}`}>
          {result.message}
        </span>
      </div>

      {result.report.ai_summary && (
        <p className="mt-2 leading-relaxed text-neutral-700">“{result.report.ai_summary}”</p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge label={`Report #${result.report.id}`} tone="slate" />
        <Badge label={TYPE_LABELS[result.report.type] ?? result.report.type} tone="blue" />
        <PriorityBadge priority={result.report.priority} />
        {result.cluster?.id ? (
          <Badge label={`signal #${result.cluster.id} · ${result.cluster.independent_report_count} independent`} tone="slate" />
        ) : null}
        {result.ai.processed && result.ai.model ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
            {result.ai.model}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-[10px] text-neutral-500">
        Report saved {relativeTime(result.report.created_at)} · anonymous, no identifiers stored
      </p>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-neutral-200 bg-neutral-100 px-4 py-3">
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-neutral-400" />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-neutral-400" />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-neutral-400" />
      <span className="ml-2 text-[11px] text-neutral-500">AI triage in progress…</span>
    </div>
  )
}

export default function IngestModal({
  onClose,
  onIngested,
}: {
  onClose: () => void
  onIngested: (result: IngestResult) => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      text: 'Welcome to the live triage channel. Describe what you are seeing in English, French or Pidgin — the AI will classify the incident and cross-check it against other reports in real time. Voice notes work too.',
      time: new Date().toISOString(),
    },
  ])
  const [input, setInput] = useState('')
  const [language, setLanguage] = useState<'auto' | 'en' | 'fr' | 'pidgin'>('auto')
  const [anonymousId, setAnonymousId] = useState('')
  const [thinking, setThinking] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // --- voice recording ---
  const [recording, setRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      const mr = mediaRecorderRef.current
      if (mr && mr.state !== 'inactive') mr.stop()
    }
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const pushMessage = (msg: ChatMessage) => setMessages((m) => [...m, msg])

  const handleResult = (result: IngestResult) => {
    pushMessage({ id: `r-${result.report.id}-${Date.now()}`, role: 'system', result, time: new Date().toISOString() })
    onIngested(result)
  }

  const sendText = async () => {
    const text = input.trim()
    if (text.length < 3 || thinking) return
    pushMessage({ id: `u-${Date.now()}`, role: 'user', text, time: new Date().toISOString() })
    setInput('')
    setThinking(true)
    try {
      const body: IngestInput = {
        text,
        language,
        ...(anonymousId.trim() ? { anonymous_id: anonymousId.trim() } : {}),
      }
      const res = await api.ingestText(body)
      handleResult(res)
    } catch (err) {
      pushMessage({
        id: `e-${Date.now()}`,
        role: 'system',
        text: `⚠ ${err instanceof Error ? err.message : 'Failed to process the message.'}`,
        time: new Date().toISOString(),
      })
    } finally {
      setThinking(false)
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
      }
      mr.start()
      mediaRecorderRef.current = mr
      setRecording(true)
      setRecordingSeconds(0)
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 1)
      }, 1000)
    } catch {
      pushMessage({
        id: `e-${Date.now()}`,
        role: 'system',
        text: '⚠ Microphone access was denied. Allow it to record a voice report.',
        time: new Date().toISOString(),
      })
    }
  }

  const stopRecording = () => {
    const mr = mediaRecorderRef.current
    mr?.stop()
    mediaRecorderRef.current = null
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    setRecording(false)
  }

  const submitVoice = async () => {
    stopRecording()
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    if (blob.size === 0) {
      pushMessage({ id: `e-${Date.now()}`, role: 'system', text: '⚠ No recording captured. Try again.', time: new Date().toISOString() })
      return
    }
    setThinking(true)
    try {
      const res = await api.ingestAudio(blob, {
        anonymous_id: anonymousId.trim() || undefined,
        language,
        filename: RECORD_FILE_NAME,
      })
      handleResult(res)
    } catch (err) {
      pushMessage({
        id: `e-${Date.now()}`,
        role: 'system',
        text: `⚠ ${err instanceof Error ? err.message : 'Failed to process the voice report.'}`,
        time: new Date().toISOString(),
      })
    } finally {
      setThinking(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendText()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="flex h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header — styled like a live chat */}
        <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white">
                <BotIcon size={20} />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                <span className="live-dot"><span className="live-dot-core" /></span>
              </span>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Live triage channel</h2>
              <p className="text-[11px] text-emerald-600">AI online · typically replies in seconds</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
            <XIcon size={18} />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {messages.map((m) => {
            if (m.role === 'user') {
              return (
                <div key={m.id} className="flex justify-end animate-fade-up">
                  <div className="max-w-md rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-sm text-white shadow-glow">
                    <p className="leading-relaxed">{m.text}</p>
                    <p className="mt-1 text-right text-[10px] text-white/60">{relativeTime(m.time)}</p>
                  </div>
                </div>
              )
            }
            return (
              <div key={m.id} className="flex items-end gap-2 animate-fade-up">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                  <BotIcon size={14} />
                </div>
                {m.result ? (
                  <AiResultCard result={m.result} />
                ) : (
                  <div className={`max-w-md rounded-2xl rounded-tl-sm border px-4 py-2.5 text-sm leading-relaxed ${
                    m.text?.startsWith('⚠')
                      ? 'border-brand-200 bg-brand-50 text-brand-700'
                      : 'border-neutral-200 bg-neutral-100 text-neutral-700'
                  }`}>
                    {m.text}
                  </div>
                )}
              </div>
            )
          })}
          {thinking && <TypingIndicator />}
        </div>

        {/* Composer */}
        <div className="border-t border-neutral-200 bg-neutral-50 px-5 py-3">
          {recording ? (
            <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="live-dot"><span className="live-dot-core !bg-red-500" /></span>
                <span className="text-sm font-medium text-red-700">Recording… {recordingSeconds}s</span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="btn-secondary" onClick={stopRecording}>Cancel</button>
                <button type="button" className="btn-primary" onClick={submitVoice}>
                  <CheckIcon size={14} />
                  Send voice report
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <select
                  className="input h-7 w-auto py-0 text-xs"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as typeof language)}
                >
                  {(Object.keys(LANGUAGE_LABELS) as Array<keyof typeof LANGUAGE_LABELS>).map((k) => (
                    <option key={k} value={k}>{LANGUAGE_LABELS[k]}</option>
                  ))}
                </select>
                <input
                  className="input h-7 w-44 py-0 text-xs"
                  placeholder="Anonymous ID (optional)"
                  value={anonymousId}
                  onChange={(e) => setAnonymousId(e.target.value)}
                />
                {messages.length <= 1 && (
                  <div className="ml-auto hidden gap-1.5 sm:flex">
                    {SAMPLES.map((s) => (
                      <button
                        key={s.lang}
                        type="button"
                        onClick={() => setInput(s.text)}
                        className="rounded-full border border-neutral-300 px-2.5 py-1 text-[11px] text-neutral-500 transition-colors hover:border-brand-500/60 hover:text-brand-700"
                      >
                        {LANGUAGE_LABELS[s.lang].split(' ')[0]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={startRecording}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-neutral-500 transition-colors hover:border-brand-500/60 hover:text-brand-700"
                  title="Record a voice report"
                >
                  <MicIcon size={16} />
                </button>
                <textarea
                  ref={inputRef}
                  className="input max-h-28 min-h-[38px] flex-1 resize-none"
                  placeholder="Describe what's happening… (Enter to send, Shift+Enter for a new line)"
                  maxLength={2000}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <button
                  type="button"
                  className="btn-primary h-9 shrink-0"
                  disabled={thinking || input.trim().length < 3}
                  onClick={sendText}
                >
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
