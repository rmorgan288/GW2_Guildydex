import { useState, useEffect, useRef, useCallback } from 'react'

// ── Meta Event Schedule (UTC) ────────────────────────────────────────────────
// interval = minutes between repeats, offsets = minutes-past-midnight UTC
const META_EVENTS = [
  { name: 'Tequatl the Sunless',   map: 'Sparkfly Fen',       color: '#e05c5c', interval: 180, offsets: [0,   180, 360, 540, 720, 900, 1080, 1260] },
  { name: 'Triple Trouble',        map: 'Bloodtide Coast',    color: '#e0935c', interval: 180, offsets: [30,  210, 390, 570, 750, 930, 1110, 1290] },
  { name: 'Ley-Line Anomaly',      map: 'Rotating Maps',      color: '#8c6fe0', interval: 120, offsets: [20,  140, 260, 380, 500, 620, 740,  860, 980, 1100, 1220, 1340] },
  { name: 'Shatterer',             map: 'Blazeridge Steppes', color: '#5ca8e0', interval: 180, offsets: [60,  240, 420, 600, 780, 960, 1140, 1320] },
  { name: 'Fire Elemental',        map: 'Metrica Province',   color: '#e07e5c', interval: 120, offsets: [10,  130, 250, 370, 490, 610, 730,  850, 970, 1090, 1210, 1330] },
  { name: 'Golem Mark II',         map: 'Mount Maelstrom',    color: '#5ce0a8', interval: 120, offsets: [30,  150, 270, 390, 510, 630, 750,  870, 990, 1110, 1230, 1350] },
  { name: 'Great Jungle Wurm',     map: 'Caledon Forest',     color: '#7ee05c', interval: 120, offsets: [15,  135, 255, 375, 495, 615, 735,  855, 975, 1095, 1215, 1335] },
  { name: 'Megadestroyer',         map: 'Mount Maelstrom',    color: '#e0c45c', interval: 180, offsets: [60,  240, 420, 600, 780, 960, 1140, 1320] },
  { name: 'Shadow Behemoth',       map: 'Queensdale',         color: '#a05ce0', interval: 120, offsets: [15,  135, 255, 375, 495, 615, 735,  855, 975, 1095, 1215, 1335] },
  { name: 'Frozen Maw',            map: 'Wayfarer Foothills', color: '#5cc8e0', interval: 120, offsets: [0,   120, 240, 360, 480, 600, 720,  840, 960, 1080, 1200, 1320] },
  { name: 'Claw of Jormag',        map: 'Frostgorge Sound',   color: '#5c8ae0', interval: 120, offsets: [90,  210, 330, 450, 570, 690, 810,  930, 1050, 1170, 1290] },
  { name: 'Svanir Shaman',         map: 'Wayfarer Foothills', color: '#5ce0d4', interval: 120, offsets: [45,  165, 285, 405, 525, 645, 765,  885, 1005, 1125, 1245] },
]

function getNextOccurrences(event, count = 2) {
  const now = new Date()
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes()
  const dayMin = 24 * 60

  // Build all upcoming minutes including wraparound
  const all = []
  for (const offset of event.offsets) {
    if (offset > nowMin) all.push({ min: offset, diff: offset - nowMin })
  }
  // Add next day's offsets for wraparound
  for (const offset of event.offsets) {
    all.push({ min: offset + dayMin, diff: offset + dayMin - nowMin })
  }

  all.sort((a, b) => a.diff - b.diff)

  return all.slice(0, count).map(({ diff }) => {
    const h = Math.floor(diff / 60)
    const m = diff % 60
    return {
      diff,
      label: diff < 60 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`,
      imminent: diff <= 15,
    }
  })
}

// ── Voice Mic Button ─────────────────────────────────────────────────────────
function MicButton({ isListening, isThinking, isSpeaking, onToggle }) {
  const disabled = isThinking || isSpeaking

  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      aria-label={isListening ? 'Stop listening' : 'Start listening'}
      style={{
        width: 76,
        height: 76,
        borderRadius: '50%',
        background: isListening
          ? 'radial-gradient(circle, #5c2a2a, #3a1010)'
          : 'radial-gradient(circle, #2a2010, #1a1408)',
        border: `2px solid ${isListening ? '#e05c5c' : '#c9a84c'}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 30,
        opacity: disabled ? 0.4 : 1,
        animation: isListening ? 'ring-pulse 1s ease-in-out infinite' : 'glow-idle 3s ease-in-out infinite',
        transition: 'border-color 0.2s, background 0.2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {isListening ? '🔴' : '🎙️'}
    </button>
  )
}

// ── Text Input ───────────────────────────────────────────────────────────────
function TextInput({ onSend, disabled }) {
  const [value, setValue] = useState('')

  const submit = () => {
    if (value.trim() && !disabled) {
      onSend(value.trim())
      setValue('')
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, padding: '0 20px 10px' }}>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        disabled={disabled}
        placeholder="Type a question or use the mic…"
        style={{
          flex: 1,
          background: '#0f0e0a',
          border: '1px solid #2a2010',
          borderRadius: 8,
          padding: '9px 12px',
          color: '#d4c9a8',
          fontSize: 13,
          outline: 'none',
          fontFamily: 'inherit',
          opacity: disabled ? 0.5 : 1,
        }}
      />
      <button
        onClick={submit}
        disabled={disabled || !value.trim()}
        style={{
          background: '#1a1408',
          border: '1px solid #c9a84c44',
          color: '#c9a84c',
          borderRadius: 8,
          padding: '9px 14px',
          cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer',
          fontSize: 18,
          opacity: disabled || !value.trim() ? 0.3 : 1,
          transition: 'opacity 0.2s',
        }}
      >
        →
      </button>
    </div>
  )
}

// ── Chat Messages ────────────────────────────────────────────────────────────
function ChatMessages({ messages, isThinking, transcript }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
      {messages.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#3a3020' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚔️</div>
          <div style={{ fontSize: 14, color: '#6a5e42', marginBottom: 12, fontWeight: 600 }}>
            Your companion is ready
          </div>
          <div style={{ fontSize: 12, color: '#3a3020', lineHeight: 2 }}>
            "What's the meta build for Virtuoso in T4 fractals?"<br />
            "Explain the Dhuum encounter for a new raider"<br />
            "Fastest way to get ascended armour?"<br />
            "What should I bring to Dragon's End?"
          </div>
        </div>
      )}

      {messages.map((msg, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            gap: 8,
            marginBottom: 14,
            alignItems: 'flex-start',
          }}
        >
          <div style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            flexShrink: 0,
            background: msg.role === 'user'
              ? '#0f1a0f'
              : 'linear-gradient(135deg, #c9a84c, #8b6914)',
            border: msg.role === 'user' ? '1px solid #1a3a1a' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 15,
          }}>
            {msg.role === 'user' ? '🧝' : '⚔️'}
          </div>

          <div style={{
            background: msg.role === 'user' ? '#0f1a0f' : '#12100a',
            border: `1px solid ${msg.role === 'user' ? '#1a3a1a' : '#2a2010'}`,
            borderRadius: msg.role === 'user'
              ? '12px 4px 12px 12px'
              : '4px 12px 12px 12px',
            padding: '10px 14px',
            maxWidth: '82%',
            fontSize: 13,
            lineHeight: 1.65,
            color: msg.role === 'user' ? '#a8d4a8' : '#d4c9a8',
          }}>
            {msg.content}
          </div>
        </div>
      ))}

      {isThinking && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'linear-gradient(135deg, #c9a84c, #8b6914)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
          }}>⚔️</div>
          <div style={{
            background: '#12100a',
            border: '1px solid #2a2010',
            borderRadius: '4px 12px 12px 12px',
            padding: '12px 16px',
            display: 'flex', gap: 5, alignItems: 'center',
          }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 7, height: 7, borderRadius: '50%',
                background: '#c9a84c',
                animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        </div>
      )}

      {transcript && (
        <div style={{
          textAlign: 'right',
          color: '#6a8a6a',
          fontSize: 11,
          fontStyle: 'italic',
          padding: '2px 8px',
          marginBottom: 8,
        }}>
          "{transcript}"
        </div>
      )}

      <div ref={endRef} />
    </div>
  )
}

// ── Event Timers ─────────────────────────────────────────────────────────────
function EventTimers() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  const utcTime = now.toUTCString().split(' ')[4]

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
      <div style={{
        fontSize: 11,
        color: '#6a5e42',
        marginBottom: 14,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}>
        UTC {utcTime} · Updates every 30s
      </div>

      {META_EVENTS.map((evt, i) => {
        const next = getNextOccurrences(evt, 2)
        const soonest = next[0]
        return (
          <div
            key={i}
            style={{
              background: '#12100a',
              border: `1px solid ${soonest?.imminent ? evt.color + '88' : '#2a2010'}`,
              borderLeft: `3px solid ${evt.color}`,
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              boxShadow: soonest?.imminent ? `0 0 14px ${evt.color}33` : 'none',
              transition: 'box-shadow 0.3s',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12,
                fontWeight: 700,
                color: soonest?.imminent ? evt.color : '#d4c9a8',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>{evt.name}</div>
              <div style={{ fontSize: 10, color: '#6a5e42', marginTop: 2 }}>{evt.map}</div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {next.map((n, j) => (
                <div key={j} style={{
                  background: j === 0 && n.imminent ? evt.color + '22' : '#0a0c0f',
                  border: `1px solid ${j === 0 && n.imminent ? evt.color + '66' : '#2a2010'}`,
                  borderRadius: 5,
                  padding: '3px 9px',
                  fontSize: 11,
                  fontWeight: 700,
                  color: j === 0 && n.imminent ? evt.color : '#8a7a58',
                  minWidth: 42,
                  textAlign: 'center',
                }}>
                  {n.label}
                </div>
              ))}
            </div>
          </div>
        )
      })}

      <div style={{
        marginTop: 16,
        padding: 12,
        background: '#0f0e0a',
        border: '1px solid #2a2010',
        borderRadius: 8,
        fontSize: 11,
        color: '#4a3e28',
        lineHeight: 1.7,
        textAlign: 'center',
      }}>
        Times based on community-documented UTC schedules<br />
        Ask the companion: "What's the next meta event?"
      </div>
    </div>
  )
}

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState([])
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [status, setStatus] = useState('Ready')
  const [voiceSupported, setVoiceSupported] = useState(true)
  const [activeTab, setActiveTab] = useState('companion')
  const [voices, setVoices] = useState([])
  const [selectedVoice, setSelectedVoice] = useState(null)

  const recognitionRef = useRef(null)
  const synthRef = useRef(window.speechSynthesis)
  const historyRef = useRef([])

  // Load TTS voices
  useEffect(() => {
    const load = () => {
      const v = synthRef.current.getVoices()
      if (v.length) {
        setVoices(v)
        const preferred =
          v.find(x => x.name.includes('Google UK English Male')) ||
          v.find(x => x.lang === 'en-GB') ||
          v.find(x => x.lang.startsWith('en')) ||
          v[0]
        setSelectedVoice(preferred)
      }
    }
    load()
    synthRef.current.onvoiceschanged = load
  }, [])

  // Set up speech recognition
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setVoiceSupported(false); return }

    const rec = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-GB'

    rec.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join('')
      setTranscript(t)
      if (e.results[e.results.length - 1].isFinal) {
        setTranscript('')
        handleQuery(t)
      }
    }
    rec.onend = () => { setIsListening(false); setStatus('Ready') }
    rec.onerror = (e) => {
      setStatus(`Mic error: ${e.error}`)
      setIsListening(false)
    }

    recognitionRef.current = rec
  }, [])

  const speak = useCallback((text) => {
    synthRef.current.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    if (selectedVoice) utt.voice = selectedVoice
    utt.rate = 1.05
    utt.pitch = 1.0
    utt.onstart = () => { setIsSpeaking(true); setStatus('Speaking…') }
    utt.onend = () => { setIsSpeaking(false); setStatus('Ready') }
    utt.onerror = () => { setIsSpeaking(false); setStatus('Ready') }
    synthRef.current.speak(utt)
  }, [selectedVoice])

  const handleQuery = useCallback(async (query) => {
    if (!query.trim()) return

    const userMsg = { role: 'user', content: query }
    historyRef.current = [...historyRef.current, userMsg]
    setMessages(prev => [...prev, userMsg])
    setIsThinking(true)
    setStatus('Thinking…')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyRef.current }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        throw new Error(data.error || 'API error')
      }

      const assistantMsg = { role: 'assistant', content: data.reply }
      historyRef.current = [...historyRef.current, assistantMsg]
      setMessages(prev => [...prev, assistantMsg])
      setIsThinking(false)
      speak(data.reply)
    } catch (err) {
      const errMsg = { role: 'assistant', content: `Error: ${err.message}` }
      setMessages(prev => [...prev, errMsg])
      setIsThinking(false)
      setStatus('Error')
    }
  }, [speak])

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop()
    } else {
      synthRef.current.cancel()
      setIsSpeaking(false)
      try {
        recognitionRef.current?.start()
        setIsListening(true)
        setStatus('Listening…')
      } catch {
        setStatus('Mic unavailable — try reloading')
      }
    }
  }

  const stopSpeaking = () => {
    synthRef.current.cancel()
    setIsSpeaking(false)
    setStatus('Ready')
  }

  const clearChat = () => {
    historyRef.current = []
    setMessages([])
    setStatus('Ready')
  }

  return (
    <div style={{
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      maxWidth: 720,
      margin: '0 auto',
      background: '#0a0c0f',
    }}>
      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(180deg, #12100a 0%, #0a0c0f 100%)',
        borderBottom: '1px solid #2a2418',
        padding: '12px 20px 0',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #c9a84c, #8b6914)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            boxShadow: '0 0 14px #c9a84c44',
            flexShrink: 0,
          }}>⚔️</div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 15,
              fontWeight: 700,
              color: '#e8d5a0',
              letterSpacing: '0.04em',
            }}>GW2 Companion</div>
            <div style={{
              fontSize: 10,
              color: '#6a5e42',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}>{status}</div>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {isSpeaking && (
              <button onClick={stopSpeaking} style={{
                background: '#2a1a1a',
                border: '1px solid #5c2a2a',
                color: '#e05c5c',
                borderRadius: 6,
                padding: '5px 10px',
                fontSize: 11,
                cursor: 'pointer',
                fontWeight: 600,
              }}>■ Stop</button>
            )}
            {messages.length > 0 && (
              <button onClick={clearChat} style={{
                background: '#1a1408',
                border: '1px solid #2a2010',
                color: '#6a5e42',
                borderRadius: 6,
                padding: '5px 10px',
                fontSize: 11,
                cursor: 'pointer',
              }}>Clear</button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex' }}>
          {[
            { id: 'companion', label: '⚔️  Companion' },
            { id: 'events', label: '⏱  Events' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px 16px',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: activeTab === tab.id ? '#c9a84c' : '#6a5e42',
                borderBottom: activeTab === tab.id ? '2px solid #c9a84c' : '2px solid transparent',
                marginBottom: -1,
                transition: 'color 0.15s',
              }}
            >{tab.label}</button>
          ))}
        </div>
      </div>

      {/* ── Companion Tab ── */}
      {activeTab === 'companion' && (
        <>
          <ChatMessages
            messages={messages}
            isThinking={isThinking}
            transcript={transcript}
          />

          <div style={{ flexShrink: 0, borderTop: '1px solid #1a1610' }}>
            <TextInput onSend={handleQuery} disabled={isThinking || isListening} />

            <div style={{
              padding: '12px 20px 28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
            }}>
              {!voiceSupported ? (
                <div style={{
                  fontSize: 12,
                  color: '#6a5e42',
                  textAlign: 'center',
                  padding: '12px 20px',
                  background: '#12100a',
                  border: '1px solid #2a2010',
                  borderRadius: 8,
                }}>
                  Voice input requires Chrome or Edge.<br />Text input works in all browsers.
                </div>
              ) : (
                <>
                  <MicButton
                    isListening={isListening}
                    isThinking={isThinking}
                    isSpeaking={isSpeaking}
                    onToggle={toggleListen}
                  />
                  <div style={{
                    fontSize: 11,
                    color: '#6a5e42',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}>
                    {isListening
                      ? 'Listening — speak now'
                      : isSpeaking
                        ? 'Speaking…'
                        : isThinking
                          ? 'Thinking…'
                          : 'Tap to speak'}
                  </div>

                  {voices.length > 1 && (
                    <select
                      value={selectedVoice?.name || ''}
                      onChange={e => {
                        const v = voices.find(x => x.name === e.target.value)
                        setSelectedVoice(v)
                      }}
                      style={{
                        background: '#0f0e0a',
                        border: '1px solid #2a2010',
                        color: '#6a5e42',
                        borderRadius: 6,
                        padding: '4px 8px',
                        fontSize: 10,
                        cursor: 'pointer',
                        maxWidth: 220,
                      }}
                    >
                      {voices
                        .filter(v => v.lang.startsWith('en'))
                        .map(v => (
                          <option key={v.name} value={v.name}>{v.name}</option>
                        ))}
                    </select>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Events Tab ── */}
      {activeTab === 'events' && <EventTimers />}
    </div>
  )
}
