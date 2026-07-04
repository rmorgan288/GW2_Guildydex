import { useState, useEffect, useRef, useCallback } from 'react'

// ── GW2 API ──────────────────────────────────────────────────────────────────
const GW2_API = 'https://api.guildwars2.com/v2'

async function gw2Fetch(endpoint, apiKey) {
  const sep = endpoint.includes('?') ? '&' : '?'
  const res = await fetch(`${GW2_API}${endpoint}${sep}access_token=${apiKey}`)
  if (!res.ok) throw new Error(`GW2 API error: ${res.status}`)
  return res.json()
}

async function fetchAccountContext(apiKey) {
  const [account, characters, achievements] = await Promise.allSettled([
    gw2Fetch('/account', apiKey),
    gw2Fetch('/characters?page=0', apiKey),
    gw2Fetch('/account/achievements?page=0', apiKey),
  ])

  const lines = []

  if (account.status === 'fulfilled') {
    const a = account.value
    lines.push(`Account: ${a.name} | World: ${a.world} | Fractal level: ${a.fractal_level ?? 'unknown'} | WvW rank: ${a.wvw_rank ?? 'unknown'}`)
    if (a.guilds?.length) lines.push(`Guilds: ${a.guilds.length} guild(s)`)
  }

  if (characters.status === 'fulfilled') {
    const chars = characters.value.slice(0, 8)
    const charList = chars.map(c =>
      `${c.name} (${c.race} ${c.profession}, lvl ${c.level}${c.specialization ? ', ' + c.specialization : ''})`
    ).join(' | ')
    lines.push(`Characters: ${charList}`)
  }

  if (achievements.status === 'fulfilled') {
    const done = achievements.value.filter(a => a.done).length
    const inProgress = achievements.value.filter(a => !a.done && a.current > 0).length
    lines.push(`Achievements: ${done} completed, ${inProgress} in progress`)
  }

  return lines.join('\n')
}

async function fetchAchievementProgress(apiKey, searchTerm) {
  // Search achievements by name
  const [acctAch, allAch] = await Promise.all([
    gw2Fetch('/account/achievements', apiKey),
    fetch(`${GW2_API}/achievements/search?text=${encodeURIComponent(searchTerm)}`).then(r => r.json()).catch(() => [])
  ])

  if (!allAch.length) return null

  // Get details for matching achievements
  const ids = allAch.slice(0, 5).join(',')
  const details = await fetch(`${GW2_API}/achievements?ids=${ids}`).then(r => r.json()).catch(() => [])
  const acctMap = Object.fromEntries(acctAch.map(a => [a.id, a]))

  return details.map(d => {
    const prog = acctMap[d.id]
    return {
      name: d.name,
      description: d.requirement,
      done: prog?.done ?? false,
      current: prog?.current ?? 0,
      max: d.tiers?.[d.tiers.length - 1]?.count ?? prog?.max ?? '?',
    }
  })
}

// ── Wiki Image ───────────────────────────────────────────────────────────────
async function fetchWikiImage(query) {
  try {
    const url = `https://wiki.guildwars2.com/api.php?action=query&titles=${encodeURIComponent(query)}&prop=pageimages&pithumbsize=400&format=json&origin=*`
    const res = await fetch(url)
    const data = await res.json()
    const pages = data.query?.pages
    if (!pages) return null
    const page = pages[Object.keys(pages)[0]]
    return page?.thumbnail?.source ?? null
  } catch {
    return null
  }
}

// ── Meta Events ──────────────────────────────────────────────────────────────
const META_EVENTS = [
  { name: 'Tequatl the Sunless',   map: 'Sparkfly Fen',       color: '#e05c5c', offsets: [0,180,360,540,720,900,1080,1260] },
  { name: 'Triple Trouble',        map: 'Bloodtide Coast',    color: '#e0935c', offsets: [30,210,390,570,750,930,1110,1290] },
  { name: 'Ley-Line Anomaly',      map: 'Rotating Maps',      color: '#8c6fe0', offsets: [20,140,260,380,500,620,740,860,980,1100,1220,1340] },
  { name: 'Shatterer',             map: 'Blazeridge Steppes', color: '#5ca8e0', offsets: [60,240,420,600,780,960,1140,1320] },
  { name: 'Fire Elemental',        map: 'Metrica Province',   color: '#e07e5c', offsets: [10,130,250,370,490,610,730,850,970,1090,1210,1330] },
  { name: 'Golem Mark II',         map: 'Mount Maelstrom',    color: '#5ce0a8', offsets: [30,150,270,390,510,630,750,870,990,1110,1230,1350] },
  { name: 'Great Jungle Wurm',     map: 'Caledon Forest',     color: '#7ee05c', offsets: [15,135,255,375,495,615,735,855,975,1095,1215,1335] },
  { name: 'Megadestroyer',         map: 'Mount Maelstrom',    color: '#e0c45c', offsets: [60,240,420,600,780,960,1140,1320] },
  { name: 'Shadow Behemoth',       map: 'Queensdale',         color: '#a05ce0', offsets: [15,135,255,375,495,615,735,855,975,1095,1215,1335] },
  { name: 'Frozen Maw',            map: 'Wayfarer Foothills', color: '#5cc8e0', offsets: [0,120,240,360,480,600,720,840,960,1080,1200,1320] },
  { name: 'Claw of Jormag',        map: 'Frostgorge Sound',   color: '#5c8ae0', offsets: [90,210,330,450,570,690,810,930,1050,1170,1290] },
  { name: 'Svanir Shaman',         map: 'Wayfarer Foothills', color: '#5ce0d4', offsets: [45,165,285,405,525,645,765,885,1005,1125,1245] },
]

function getNextOccurrences(event, count = 2) {
  const now = new Date()
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes()
  const dayMin = 24 * 60
  const all = []
  for (const o of event.offsets) {
    if (o > nowMin + 1) all.push(o - nowMin)
  }
  for (const o of event.offsets) all.push(o + dayMin - nowMin)
  all.sort((a, b) => a - b)
  return all.slice(0, count).map(diff => ({
    diff,
    label: diff < 60 ? `${diff}m` : diff % 60 === 0 ? `${Math.floor(diff/60)}h` : `${Math.floor(diff/60)}h ${diff%60}m`,
    imminent: diff <= 15,
  }))
}

// ── Styles ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#0a0c0f', surface: '#12100a', border: '#2a2010',
  gold: '#c9a84c', goldDim: '#6a5e42', goldFaint: '#2a2010',
  text: '#d4c9a8', textDim: '#8a7a58', textFaint: '#4a3e28',
  green: '#3fb950', red: '#e05c5c', purple: '#8c6fe0',
}

const btn = (active, color = C.gold) => ({
  background: 'none', border: 'none', cursor: 'pointer',
  padding: '8px 16px', fontSize: 12, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.1em',
  color: active ? color : C.goldDim,
  borderBottom: active ? `2px solid ${color}` : '2px solid transparent',
  marginBottom: -1, transition: 'color 0.15s',
})

// ── Sub-components ────────────────────────────────────────────────────────────

function WikiImage({ src, query }) {
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState(false)
  if (err || !src) return null
  return (
    <div style={{ marginTop: 8, marginBottom: 4 }}>
      {!loaded && (
        <div style={{ height: 80, background: C.surface, borderRadius: 6, border: `1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ fontSize: 10, color: C.textFaint }}>Loading image…</span>
        </div>
      )}
      <img
        src={src}
        alt={query}
        onLoad={() => setLoaded(true)}
        onError={() => setErr(true)}
        style={{
          display: loaded ? 'block' : 'none',
          maxWidth: '100%', maxHeight: 220,
          borderRadius: 6, border: `1px solid ${C.border}`,
          objectFit: 'cover',
        }}
      />
      {loaded && (
        <div style={{ fontSize: 9, color: C.textFaint, marginTop: 3, letterSpacing: '0.06em' }}>
          📖 GW2 Wiki — {query}
        </div>
      )}
    </div>
  )
}

function ChatMessages({ messages, isThinking, transcript }) {
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, isThinking])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
      {messages.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>⚔️</div>
          <div style={{ fontSize: 13, color: C.goldDim, marginBottom: 10, fontWeight: 600 }}>Your companion is ready</div>
          <div style={{ fontSize: 11, color: C.textFaint, lineHeight: 2.0 }}>
            "What's the meta build for Virtuoso in T4 fractals?"<br />
            "Explain the Dhuum encounter for a new raider"<br />
            "Fastest way to get ascended armour?"<br />
            "What achievements should I focus on next?"
          </div>
        </div>
      )}

      {messages.map((msg, i) => (
        <div key={i} style={{ marginBottom: 16, display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-start' }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: msg.role === 'user' ? '#0f1a0f' : `linear-gradient(135deg, ${C.gold}, #8b6914)`,
            border: msg.role === 'user' ? `1px solid #1a3a1a` : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
          }}>
            {msg.role === 'user' ? '🧝' : '⚔️'}
          </div>
          <div style={{ maxWidth: '82%' }}>
            <div style={{
              background: msg.role === 'user' ? '#0f1a0f' : C.surface,
              border: `1px solid ${msg.role === 'user' ? '#1a3a1a' : C.border}`,
              borderRadius: msg.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
              padding: '10px 14px', fontSize: 13, lineHeight: 1.65,
              color: msg.role === 'user' ? '#a8d4a8' : C.text,
            }}>
              {msg.content}
            </div>
            {msg.imageUrl && <WikiImage src={msg.imageUrl} query={msg.imageQuery} />}
          </div>
        </div>
      ))}

      {isThinking && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: `linear-gradient(135deg, ${C.gold}, #8b6914)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⚔️</div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '4px 12px 12px 12px', padding: '12px 16px', display: 'flex', gap: 5 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: C.gold, animation: `pulse-dot 1.2s ease-in-out ${i*0.2}s infinite` }} />
            ))}
          </div>
        </div>
      )}

      {transcript && (
        <div style={{ textAlign: 'right', color: '#6a8a6a', fontSize: 11, fontStyle: 'italic', padding: '2px 8px', marginBottom: 8 }}>
          "{transcript}"
        </div>
      )}
      <div ref={endRef} />
    </div>
  )
}

function EventTimers() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t) }, [])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
      <div style={{ fontSize: 11, color: C.goldDim, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        UTC {now.toUTCString().split(' ')[4]} · Updates every 30s
      </div>
      {META_EVENTS.map((evt, i) => {
        const next = getNextOccurrences(evt, 2)
        const soon = next[0]
        return (
          <div key={i} style={{
            background: C.surface, border: `1px solid ${soon?.imminent ? evt.color+'88' : C.border}`,
            borderLeft: `3px solid ${evt.color}`, borderRadius: 8, padding: '10px 14px', marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: soon?.imminent ? `0 0 14px ${evt.color}33` : 'none',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: soon?.imminent ? evt.color : C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{evt.name}</div>
              <div style={{ fontSize: 10, color: C.goldDim, marginTop: 2 }}>{evt.map}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {next.map((n, j) => (
                <div key={j} style={{
                  background: j===0 && n.imminent ? evt.color+'22' : '#0a0c0f',
                  border: `1px solid ${j===0 && n.imminent ? evt.color+'66' : C.border}`,
                  borderRadius: 5, padding: '3px 9px', fontSize: 11, fontWeight: 700,
                  color: j===0 && n.imminent ? evt.color : C.textDim, minWidth: 42, textAlign: 'center',
                }}>{n.label}</div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SettingsTab({ gw2Key, setGw2Key, accountData, setAccountData, accountContext, setAccountContext, spoilerFree, setSpoilerFree, voices, selectedVoice, setSelectedVoice }) {
  const [keyInput, setKeyInput] = useState(gw2Key)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [achSearch, setAchSearch] = useState('')
  const [achResults, setAchResults] = useState(null)
  const [achLoading, setAchLoading] = useState(false)

  const connectGW2 = async () => {
    if (!keyInput.trim()) return
    setLoading(true)
    setError('')
    try {
      const ctx = await fetchAccountContext(keyInput.trim())
      setGw2Key(keyInput.trim())
      setAccountContext(ctx)
      // Parse account data for display
      const acc = await gw2Fetch('/account', keyInput.trim()).catch(() => null)
      const chars = await gw2Fetch('/characters?page=0', keyInput.trim()).catch(() => [])
      setAccountData({ account: acc, characters: chars })
      localStorage.setItem('gw2_api_key', keyInput.trim())
    } catch (e) {
      setError('Invalid API key or network error. Check your key and try again.')
    }
    setLoading(false)
  }

  const searchAchievements = async () => {
    if (!gw2Key || !achSearch.trim()) return
    setAchLoading(true)
    setAchResults(null)
    try {
      const results = await fetchAchievementProgress(gw2Key, achSearch)
      setAchResults(results)
    } catch {
      setAchResults([])
    }
    setAchLoading(false)
  }

  const disconnect = () => {
    setGw2Key('')
    setAccountData(null)
    setAccountContext('')
    setKeyInput('')
    localStorage.removeItem('gw2_api_key')
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

      {/* Spoiler Mode */}
      <Section title="Companion Settings">
        <ToggleRow
          label="Spoiler-free mode"
          desc="Hides story outcomes, character fates, and expansion endings. Ask 'spoilers ok' to unlock for a specific question."
          value={spoilerFree}
          onChange={setSpoilerFree}
        />
      </Section>

      {/* Voice */}
      {voices.length > 1 && (
        <Section title="Voice">
          <div style={{ fontSize: 11, color: C.goldDim, marginBottom: 8 }}>Output voice (English only shown)</div>
          <select
            value={selectedVoice?.name || ''}
            onChange={e => setSelectedVoice(voices.find(v => v.name === e.target.value))}
            style={{ background: '#0f0e0a', border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 6, padding: '6px 10px', fontSize: 12, width: '100%', cursor: 'pointer' }}
          >
            {voices.filter(v => v.lang.startsWith('en')).map(v => (
              <option key={v.name} value={v.name}>{v.name}</option>
            ))}
          </select>
        </Section>
      )}

      {/* GW2 API Key */}
      <Section title="GW2 Account">
        {accountData ? (
          <div>
            <div style={{ background: '#0f1a0f', border: '1px solid #1a3a1a', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.green, marginBottom: 6 }}>✓ Connected</div>
              <div style={{ fontSize: 11, color: C.text, marginBottom: 2 }}>{accountData.account?.name}</div>
              <div style={{ fontSize: 10, color: C.goldDim }}>{accountData.characters?.length ?? 0} characters loaded</div>
              {accountData.characters?.slice(0, 4).map(c => (
                <div key={c.name} style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
                  {c.name} — {c.race} {c.profession} Lv{c.level}
                </div>
              ))}
            </div>
            <button onClick={disconnect} style={{ background: '#1a0f0f', border: `1px solid #3a1a1a`, color: '#e05c5c', borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer', width: '100%' }}>
              Disconnect account
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 11, color: C.goldDim, marginBottom: 8, lineHeight: 1.6 }}>
              Connect your GW2 API key to personalise answers with your characters, achievement progress, and fractal level.
              Get your key at <span style={{ color: C.gold }}>account.arena.net → Applications</span>.
            </div>
            <input
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && connectGW2()}
              placeholder="Paste your GW2 API key…"
              style={{ background: '#0f0e0a', border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '8px 12px', fontSize: 12, width: '100%', fontFamily: 'monospace', marginBottom: 8, outline: 'none' }}
            />
            {error && <div style={{ fontSize: 11, color: C.red, marginBottom: 8 }}>{error}</div>}
            <button onClick={connectGW2} disabled={loading || !keyInput.trim()} style={{
              background: loading ? '#1a1408' : `linear-gradient(135deg, #2a2010, #1a1408)`,
              border: `1px solid ${C.gold}44`, color: C.gold, borderRadius: 6,
              padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', width: '100%',
              opacity: !keyInput.trim() ? 0.4 : 1,
            }}>
              {loading ? 'Connecting…' : 'Connect account'}
            </button>
          </div>
        )}
      </Section>

      {/* Achievement lookup */}
      {gw2Key && (
        <Section title="Achievement Progress">
          <div style={{ fontSize: 11, color: C.goldDim, marginBottom: 8 }}>Search your achievement progress</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              value={achSearch}
              onChange={e => setAchSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchAchievements()}
              placeholder="e.g. Legendary Insight, Dragon…"
              style={{ flex: 1, background: '#0f0e0a', border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '7px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
            />
            <button onClick={searchAchievements} disabled={achLoading} style={{ background: '#1a1408', border: `1px solid ${C.border}`, color: C.goldDim, borderRadius: 6, padding: '7px 12px', fontSize: 11, cursor: 'pointer' }}>
              {achLoading ? '…' : 'Search'}
            </button>
          </div>
          {achResults !== null && (
            achResults.length === 0
              ? <div style={{ fontSize: 11, color: C.textFaint }}>No matching achievements found.</div>
              : achResults.map((a, i) => (
                <div key={i} style={{ background: '#0f0e0a', border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: a.done ? C.green : C.text }}>{a.name}</div>
                    <div style={{ fontSize: 10, color: a.done ? C.green : C.goldDim, flexShrink: 0, marginLeft: 8 }}>
                      {a.done ? '✓ Done' : `${a.current} / ${a.max}`}
                    </div>
                  </div>
                  {!a.done && (
                    <div style={{ background: C.border, borderRadius: 2, height: 3, marginTop: 4 }}>
                      <div style={{ background: C.gold, borderRadius: 2, height: 3, width: `${Math.min(100, (a.current / a.max) * 100)}%` }} />
                    </div>
                  )}
                  {a.description && <div style={{ fontSize: 10, color: C.textFaint, marginTop: 4 }}>{a.description}</div>}
                </div>
              ))
          )}
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.goldDim, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function ToggleRow({ label, desc, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 8 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 10, color: C.textFaint, lineHeight: 1.5 }}>{desc}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', flexShrink: 0,
          background: value ? C.gold : C.border, transition: 'background 0.2s', position: 'relative',
        }}
      >
        <div style={{
          width: 16, height: 16, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 3, left: value ? 21 : 3, transition: 'left 0.2s',
        }} />
      </button>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
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

  // Settings
  const [spoilerFree, setSpoilerFree] = useState(() => localStorage.getItem('spoiler_free') === 'true')
  const [gw2Key, setGw2Key] = useState(() => localStorage.getItem('gw2_api_key') || '')
  const [accountData, setAccountData] = useState(null)
  const [accountContext, setAccountContext] = useState('')

  const recognitionRef = useRef(null)
  const synthRef = useRef(window.speechSynthesis)
  const historyRef = useRef([])

  // Persist spoilerFree
  useEffect(() => { localStorage.setItem('spoiler_free', spoilerFree) }, [spoilerFree])

  // Auto-load GW2 account on mount if key exists
  useEffect(() => {
    if (gw2Key) {
      fetchAccountContext(gw2Key).then(ctx => {
        setAccountContext(ctx)
        Promise.all([
          gw2Fetch('/account', gw2Key).catch(() => null),
          gw2Fetch('/characters?page=0', gw2Key).catch(() => []),
        ]).then(([account, characters]) => setAccountData({ account, characters }))
      }).catch(() => {})
    }
  }, [])

  // Load voices
  useEffect(() => {
    const load = () => {
      const v = synthRef.current.getVoices()
      if (v.length) {
        setVoices(v)
        const preferred = v.find(x => x.name.includes('Google UK English Male')) || v.find(x => x.lang === 'en-GB') || v.find(x => x.lang.startsWith('en')) || v[0]
        if (!selectedVoice) setSelectedVoice(preferred)
      }
    }
    load()
    synthRef.current.onvoiceschanged = load
  }, [])

  // Speech recognition
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
      if (e.results[e.results.length - 1].isFinal) { setTranscript(''); handleQuery(t) }
    }
    rec.onend = () => { setIsListening(false); setStatus('Ready') }
    rec.onerror = (e) => { setStatus(`Mic error: ${e.error}`); setIsListening(false) }
    recognitionRef.current = rec
  }, [])

  const speak = useCallback((text) => {
    synthRef.current.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    if (selectedVoice) utt.voice = selectedVoice
    utt.rate = 1.05
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
        body: JSON.stringify({
          messages: historyRef.current,
          spoilerFree,
          accountContext,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'API error')

      const { reply, imageQuery } = data

      // Fetch wiki image if Claude requested one
      let imageUrl = null
      if (imageQuery) {
        imageUrl = await fetchWikiImage(imageQuery)
      }

      const assistantMsg = { role: 'assistant', content: reply, imageQuery, imageUrl }
      historyRef.current = [...historyRef.current, { role: 'assistant', content: reply }]
      setMessages(prev => [...prev, assistantMsg])
      setIsThinking(false)
      speak(reply)
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
      setIsThinking(false)
      setStatus('Error')
    }
  }, [speak, spoilerFree, accountContext])

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop()
    } else {
      synthRef.current.cancel()
      setIsSpeaking(false)
      try { recognitionRef.current?.start(); setIsListening(true); setStatus('Listening…') }
      catch { setStatus('Mic unavailable — try reloading') }
    }
  }

  const tabs = [
    { id: 'companion', label: '⚔️ Companion' },
    { id: 'events',    label: '⏱ Events' },
    { id: 'settings',  label: `⚙️ Settings${spoilerFree ? ' 🔒' : ''}${gw2Key ? ' ✓' : ''}` },
  ]

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', maxWidth: 720, margin: '0 auto', background: C.bg }}>

      {/* Header */}
      <div style={{ background: `linear-gradient(180deg, ${C.surface} 0%, ${C.bg} 100%)`, borderBottom: `1px solid #2a2418`, padding: '12px 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: `linear-gradient(135deg, ${C.gold}, #8b6914)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: `0 0 14px ${C.gold}44`, flexShrink: 0 }}>⚔️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e8d5a0', letterSpacing: '0.04em' }}>
              GW2 Companion
              {accountData?.account?.name && <span style={{ fontSize: 11, color: C.goldDim, fontWeight: 400, marginLeft: 8 }}>· {accountData.account.name}</span>}
            </div>
            <div style={{ fontSize: 10, color: C.goldDim, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{status}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {isSpeaking && (
              <button onClick={() => { synthRef.current.cancel(); setIsSpeaking(false); setStatus('Ready') }} style={{ background: '#2a1a1a', border: `1px solid #5c2a2a`, color: C.red, borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>■ Stop</button>
            )}
            {messages.length > 0 && (
              <button onClick={() => { historyRef.current = []; setMessages([]) }} style={{ background: '#1a1408', border: `1px solid ${C.border}`, color: C.goldDim, borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>Clear</button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex' }}>
          {tabs.map(t => <button key={t.id} onClick={() => setActiveTab(t.id)} style={btn(activeTab === t.id)}>{t.label}</button>)}
        </div>
      </div>

      {/* Companion Tab */}
      {activeTab === 'companion' && (
        <>
          <ChatMessages messages={messages} isThinking={isThinking} transcript={transcript} />
          <div style={{ flexShrink: 0, borderTop: `1px solid #1a1610` }}>
            {/* Text input */}
            <div style={{ display: 'flex', gap: 8, padding: '10px 20px 8px' }}>
              <InputBox onSend={handleQuery} disabled={isThinking || isListening} />
            </div>
            {/* Voice */}
            <div style={{ padding: '8px 20px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              {!voiceSupported ? (
                <div style={{ fontSize: 12, color: C.goldDim, textAlign: 'center', padding: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                  Voice input requires Chrome or Edge. Text input works in all browsers.
                </div>
              ) : (
                <>
                  <button onClick={toggleListen} disabled={isThinking || isSpeaking} style={{
                    width: 72, height: 72, borderRadius: '50%',
                    background: isListening ? 'radial-gradient(circle, #5c2a2a, #3a1010)' : 'radial-gradient(circle, #2a2010, #1a1408)',
                    border: `2px solid ${isListening ? C.red : C.gold}`,
                    cursor: isThinking || isSpeaking ? 'not-allowed' : 'pointer',
                    fontSize: 28, opacity: isThinking || isSpeaking ? 0.4 : 1,
                    animation: isListening ? 'ring-pulse 1s ease-in-out infinite' : 'glow-idle 3s ease-in-out infinite',
                    transition: 'border-color 0.2s, background 0.2s',
                  }}>
                    {isListening ? '🔴' : '🎙️'}
                  </button>
                  <div style={{ fontSize: 11, color: C.goldDim, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {isListening ? 'Listening — speak now' : isSpeaking ? 'Speaking…' : isThinking ? 'Thinking…' : 'Tap to speak'}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === 'events' && <EventTimers />}

      {activeTab === 'settings' && (
        <SettingsTab
          gw2Key={gw2Key} setGw2Key={setGw2Key}
          accountData={accountData} setAccountData={setAccountData}
          accountContext={accountContext} setAccountContext={setAccountContext}
          spoilerFree={spoilerFree} setSpoilerFree={setSpoilerFree}
          voices={voices} selectedVoice={selectedVoice} setSelectedVoice={setSelectedVoice}
        />
      )}

      <style>{`
        @keyframes pulse-dot { 0%,100% { opacity:.3; transform:scale(.8) } 50% { opacity:1; transform:scale(1.2) } }
        @keyframes ring-pulse { 0%,100% { box-shadow:0 0 24px #e05c5c88,0 0 48px #e05c5c44 } 50% { box-shadow:0 0 32px #e05c5ccc,0 0 60px #e05c5c66 } }
        @keyframes glow-idle { 0%,100% { box-shadow:0 0 16px #c9a84c44 } 50% { box-shadow:0 0 24px #c9a84c88 } }
        ::-webkit-scrollbar { width:4px } ::-webkit-scrollbar-track { background:#0a0c0f } ::-webkit-scrollbar-thumb { background:#2a2010; border-radius:4px }
        input::placeholder { color: #4a3e28 }
      `}</style>
    </div>
  )
}

function InputBox({ onSend, disabled }) {
  const [value, setValue] = useState('')
  const submit = () => { if (value.trim() && !disabled) { onSend(value.trim()); setValue('') } }
  return (
    <>
      <input
        value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
        disabled={disabled} placeholder="Type a question or use the mic…"
        style={{ flex: 1, background: '#0f0e0a', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, outline: 'none', fontFamily: 'inherit', opacity: disabled ? 0.5 : 1 }}
      />
      <button onClick={submit} disabled={disabled || !value.trim()} style={{ background: '#1a1408', border: `1px solid ${C.gold}44`, color: C.gold, borderRadius: 8, padding: '9px 14px', cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer', fontSize: 18, opacity: disabled || !value.trim() ? 0.3 : 1, transition: 'opacity 0.2s' }}>→</button>
    </>
  )
}
