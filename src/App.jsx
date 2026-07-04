import { useState, useEffect, useRef, useCallback } from 'react'

// ── Constants ────────────────────────────────────────────────────────────────
const GW2_API = 'https://api.guildwars2.com/v2'

const C = {
  bg: '#0a0c0f', surface: '#12100a', border: '#2a2010',
  gold: '#c9a84c', goldDim: '#6a5e42', goldFaint: '#2a2010',
  text: '#d4c9a8', textDim: '#8a7a58', textFaint: '#4a3e28',
  green: '#3fb950', red: '#e05c5c', purple: '#8c6fe0',
}

const WORLD_BOSS_NAMES = {
  admiral_taidha_covington: 'Admiral Taidha Covington',
  claw_of_jormag: 'Claw of Jormag',
  fire_elemental_of_the_corrupted_core: 'Fire Elemental',
  golem_mark_ii: 'Golem Mark II',
  great_jungle_wurm: 'Great Jungle Wurm',
  jungle_wurm: 'Evolved Jungle Wurm',
  maw_of_torment: 'Maw of Torment',
  megadestroyer: 'Megadestroyer',
  mouth_of_mordremoth: 'Mouth of Mordremoth',
  shadow_behemoth: 'Shadow Behemoth',
  svanir_the_shamans_chief: "Svanir the Shaman's Chief",
  tequatl_the_sunless: 'Tequatl the Sunless',
  the_shatterer: 'The Shatterer',
  triple_trouble_terrorwing_megadestroyer_gnashblade: 'Triple Trouble',
}

const META_EVENTS = [
  { name: 'Tequatl the Sunless',   map: 'Sparkfly Fen',       color: '#e05c5c', offsets: [0,180,360,540,720,900,1080,1260] },
  { name: 'Triple Trouble',        map: 'Bloodtide Coast',    color: '#e0935c', offsets: [30,210,390,570,750,930,1110,1290] },
  { name: 'Ley-Line Anomaly',      map: 'Rotating Maps',      color: '#8c6fe0', offsets: [20,140,260,380,500,620,740,860,980,1100,1220,1340] },
  { name: 'The Shatterer',         map: 'Blazeridge Steppes', color: '#5ca8e0', offsets: [60,240,420,600,780,960,1140,1320] },
  { name: 'Fire Elemental',        map: 'Metrica Province',   color: '#e07e5c', offsets: [10,130,250,370,490,610,730,850,970,1090,1210,1330] },
  { name: 'Golem Mark II',         map: 'Mount Maelstrom',    color: '#5ce0a8', offsets: [30,150,270,390,510,630,750,870,990,1110,1230,1350] },
  { name: 'Great Jungle Wurm',     map: 'Caledon Forest',     color: '#7ee05c', offsets: [15,135,255,375,495,615,735,855,975,1095,1215,1335] },
  { name: 'Megadestroyer',         map: 'Mount Maelstrom',    color: '#e0c45c', offsets: [60,240,420,600,780,960,1140,1320] },
  { name: 'Shadow Behemoth',       map: 'Queensdale',         color: '#a05ce0', offsets: [15,135,255,375,495,615,735,855,975,1095,1215,1335] },
  { name: 'Frozen Maw',            map: 'Wayfarer Foothills', color: '#5cc8e0', offsets: [0,120,240,360,480,600,720,840,960,1080,1200,1320] },
  { name: 'Claw of Jormag',        map: 'Frostgorge Sound',   color: '#5c8ae0', offsets: [90,210,330,450,570,690,810,930,1050,1170,1290] },
  { name: "Svanir Shaman's Chief", map: 'Wayfarer Foothills', color: '#5ce0d4', offsets: [45,165,285,405,525,645,765,885,1005,1125,1245] },
]

// ── Helpers ──────────────────────────────────────────────────────────────────
async function gw2Fetch(endpoint, apiKey) {
  const sep = endpoint.includes('?') ? '&' : '?'
  const res = await fetch(`${GW2_API}${endpoint}${sep}access_token=${apiKey}`)
  if (!res.ok) throw new Error(`GW2 API ${res.status}`)
  return res.json()
}

async function fetchAccountContext(apiKey) {
  const [account, characters] = await Promise.allSettled([
    gw2Fetch('/account', apiKey),
    gw2Fetch('/characters?page=0', apiKey),
  ])
  const lines = []
  if (account.status === 'fulfilled') {
    const a = account.value
    lines.push(`Account: ${a.name} | Fractal level: ${a.fractal_level ?? 'unknown'} | WvW rank: ${a.wvw_rank ?? 'unknown'}`)
  }
  if (characters.status === 'fulfilled') {
    const chars = characters.value.slice(0, 8)
    lines.push(`Characters: ${chars.map(c => `${c.name} (${c.race} ${c.profession} Lv${c.level})`).join(' | ')}`)
  }
  return lines.join('\n')
}

async function fetchWikiImage(query) {
  try {
    const url = `https://wiki.guildwars2.com/api.php?action=query&titles=${encodeURIComponent(query)}&prop=pageimages&pithumbsize=400&format=json&origin=*`
    const data = await fetch(url).then(r => r.json())
    const pages = data.query?.pages
    if (!pages) return null
    return pages[Object.keys(pages)[0]]?.thumbnail?.source ?? null
  } catch { return null }
}

function getNextOccurrences(event, count = 2) {
  const now = new Date()
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes()
  const dayMin = 24 * 60
  const all = []
  for (const o of event.offsets) if (o > nowMin + 1) all.push(o - nowMin)
  for (const o of event.offsets) all.push(o + dayMin - nowMin)
  all.sort((a, b) => a - b)
  return all.slice(0, count).map(diff => ({
    diff,
    label: diff < 60 ? `${diff}m` : diff % 60 === 0 ? `${Math.floor(diff/60)}h` : `${Math.floor(diff/60)}h ${diff%60}m`,
    imminent: diff <= 15,
  }))
}

function formatResetCountdown(now) {
  const tomorrow = new Date(now)
  tomorrow.setUTCHours(24, 0, 0, 0)
  const diff = tomorrow - now
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return `${h}h ${m}m`
}

// ── Wiki Image Component ─────────────────────────────────────────────────────
function WikiImage({ src, query }) {
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState(false)
  if (err || !src) return null
  return (
    <div style={{ marginTop: 8 }}>
      {!loaded && <div style={{ height: 60, background: C.surface, borderRadius: 6, border: `1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center' }}><span style={{ fontSize:10, color:C.textFaint }}>Loading…</span></div>}
      <img src={src} alt={query} onLoad={() => setLoaded(true)} onError={() => setErr(true)}
        style={{ display: loaded ? 'block' : 'none', maxWidth: '100%', maxHeight: 200, borderRadius: 6, border: `1px solid ${C.border}`, objectFit: 'cover' }} />
      {loaded && <div style={{ fontSize: 9, color: C.textFaint, marginTop: 3 }}>📖 GW2 Wiki · {query}</div>}
    </div>
  )
}

// ── Chat ─────────────────────────────────────────────────────────────────────
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
          <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: msg.role === 'user' ? '#0f1a0f' : `linear-gradient(135deg, ${C.gold}, #8b6914)`, border: msg.role === 'user' ? `1px solid #1a3a1a` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
            {msg.role === 'user' ? '🧝' : '⚔️'}
          </div>
          <div style={{ maxWidth: '82%' }}>
            <div style={{ background: msg.role === 'user' ? '#0f1a0f' : C.surface, border: `1px solid ${msg.role === 'user' ? '#1a3a1a' : C.border}`, borderRadius: msg.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px', padding: '10px 14px', fontSize: 13, lineHeight: 1.65, color: msg.role === 'user' ? '#a8d4a8' : C.text }}>
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
            {[0,1,2].map(i => <div key={i} style={{ width:7, height:7, borderRadius:'50%', background:C.gold, animation:`pulse-dot 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
          </div>
        </div>
      )}
      {transcript && <div style={{ textAlign:'right', color:'#6a8a6a', fontSize:11, fontStyle:'italic', padding:'2px 8px', marginBottom:8 }}>"{transcript}"</div>}
      <div ref={endRef} />
    </div>
  )
}

// ── Event Timers ─────────────────────────────────────────────────────────────
function EventTimers({ gw2Key }) {
  const [now, setNow] = useState(new Date())
  const [notifGranted, setNotifGranted] = useState(() => typeof Notification !== 'undefined' && Notification.permission === 'granted')
  const [notifSupported] = useState(() => typeof Notification !== 'undefined')
  const [notifyMinutes, setNotifyMinutes] = useState(() => parseInt(localStorage.getItem('gw2_notif_mins') || '10'))
  const [enabledNotifs, setEnabledNotifs] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('gw2_notif_events') || '[]')) }
    catch { return new Set() }
  })
  const [dailyData, setDailyData] = useState(null)
  const [dailyLoading, setDailyLoading] = useState(false)
  const lastNotifiedRef = useRef({})

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  // Notification checker — runs every 30s
  useEffect(() => {
    if (!notifGranted || enabledNotifs.size === 0) return
    const check = () => {
      META_EVENTS.forEach(evt => {
        if (!enabledNotifs.has(evt.name)) return
        const next = getNextOccurrences(evt, 1)[0]
        if (!next) return
        // Fire when within [notifyMinutes, notifyMinutes+1) window
        if (next.diff <= notifyMinutes && next.diff > notifyMinutes - 1) {
          const tag = `${evt.name}-${Math.floor(Date.now() / 60000)}`
          if (!lastNotifiedRef.current[tag]) {
            lastNotifiedRef.current[tag] = true
            try {
              new Notification(`⚔️ ${evt.name} in ${next.label}`, {
                body: `Starting soon in ${evt.map}`,
                icon: '/icon-192.png',
                tag: evt.name,
                silent: false,
              })
            } catch {}
          }
        }
      })
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [notifGranted, enabledNotifs, notifyMinutes])

  // Fetch daily boss completions
  useEffect(() => {
    if (gw2Key) fetchDaily()
  }, [gw2Key])

  const fetchDaily = async () => {
    if (!gw2Key) return
    setDailyLoading(true)
    try {
      const [allBosses, completed] = await Promise.all([
        fetch(`${GW2_API}/worldbosses`).then(r => r.json()),
        gw2Fetch('/account/worldbosses', gw2Key),
      ])
      setDailyData({ all: allBosses, completed })
    } catch { setDailyData(null) }
    setDailyLoading(false)
  }

  const requestPermission = async () => {
    const result = await Notification.requestPermission()
    setNotifGranted(result === 'granted')
  }

  const toggleNotif = (name) => {
    setEnabledNotifs(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      localStorage.setItem('gw2_notif_events', JSON.stringify([...next]))
      return next
    })
  }

  const setNotifyMins = (mins) => {
    setNotifyMinutes(mins)
    localStorage.setItem('gw2_notif_mins', String(mins))
  }

  const utcTime = now.toUTCString().split(' ')[4]
  const resetIn = formatResetCountdown(now)

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

      {/* Notification controls */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 2 }}>
              {notifGranted ? '🔔 Notifications on' : '🔕 Notifications off'}
            </div>
            <div style={{ fontSize: 10, color: C.goldDim }}>
              UTC {utcTime} · Daily reset in {resetIn}
            </div>
          </div>

          {notifSupported && !notifGranted && (
            <button onClick={requestPermission} style={{ background: '#1a2a1a', border: `1px solid #2a4a2a`, color: C.green, borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
              Enable notifications
            </button>
          )}

          {notifGranted && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: C.goldDim }}>Warn</span>
              {[5, 10, 15].map(m => (
                <button key={m} onClick={() => setNotifyMins(m)} style={{
                  background: notifyMinutes === m ? C.gold+'22' : '#0a0c0f',
                  border: `1px solid ${notifyMinutes === m ? C.gold+'88' : C.border}`,
                  color: notifyMinutes === m ? C.gold : C.textDim,
                  borderRadius: 5, padding: '4px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}>{m}m</button>
              ))}
            </div>
          )}
        </div>

        {notifGranted && enabledNotifs.size > 0 && (
          <div style={{ marginTop: 8, fontSize: 10, color: C.goldDim }}>
            Watching: {[...enabledNotifs].join(', ')}
          </div>
        )}
        {notifGranted && enabledNotifs.size === 0 && (
          <div style={{ marginTop: 8, fontSize: 10, color: C.textFaint }}>
            Tap 🔔 on any event below to get notified before it starts
          </div>
        )}
      </div>

      {/* Meta event list */}
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.goldDim, marginBottom: 8 }}>
        Meta Events
      </div>

      {META_EVENTS.map((evt, i) => {
        const next = getNextOccurrences(evt, 2)
        const soon = next[0]
        const notifOn = enabledNotifs.has(evt.name)
        return (
          <div key={i} style={{
            background: C.surface,
            border: `1px solid ${soon?.imminent ? evt.color+'88' : C.border}`,
            borderLeft: `3px solid ${evt.color}`,
            borderRadius: 8, padding: '9px 10px', marginBottom: 7,
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: soon?.imminent ? `0 0 14px ${evt.color}22` : 'none',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: soon?.imminent ? evt.color : C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{evt.name}</div>
              <div style={{ fontSize: 10, color: C.goldDim, marginTop: 1 }}>{evt.map}</div>
            </div>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
              {next.map((n, j) => (
                <div key={j} style={{
                  background: j===0 && n.imminent ? evt.color+'22' : '#0a0c0f',
                  border: `1px solid ${j===0 && n.imminent ? evt.color+'66' : C.border}`,
                  borderRadius: 5, padding: '3px 8px', fontSize: 11, fontWeight: 700,
                  color: j===0 && n.imminent ? evt.color : C.textDim, minWidth: 38, textAlign: 'center',
                }}>{n.label}</div>
              ))}
              {notifSupported && (
                <button
                  onClick={() => notifGranted ? toggleNotif(evt.name) : requestPermission()}
                  title={notifGranted ? (notifOn ? 'Disable notification' : 'Notify me before this event') : 'Enable notifications first'}
                  style={{
                    background: notifOn ? C.gold+'22' : 'transparent',
                    border: `1px solid ${notifOn ? C.gold+'66' : C.border}`,
                    borderRadius: 5, width: 28, height: 28, cursor: 'pointer',
                    fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: notifOn ? C.gold : C.textFaint, transition: 'all 0.15s',
                  }}
                >
                  {notifOn ? '🔔' : '🔕'}
                </button>
              )}
            </div>
          </div>
        )
      })}

      {/* Daily World Boss Tracker */}
      <div style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.goldDim, flex: 1 }}>
            Daily World Bosses · Resets in {resetIn}
          </div>
          {gw2Key && (
            <button onClick={fetchDaily} disabled={dailyLoading} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.goldDim, borderRadius: 5, padding: '3px 8px', fontSize: 10, cursor: 'pointer' }}>
              {dailyLoading ? '…' : '↻ Refresh'}
            </button>
          )}
        </div>

        {!gw2Key && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, fontSize: 11, color: C.textFaint, textAlign: 'center' }}>
            Connect your GW2 API key in Settings to track daily completions
          </div>
        )}

        {gw2Key && dailyLoading && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, fontSize: 11, color: C.textFaint, textAlign: 'center' }}>
            Loading your daily progress…
          </div>
        )}

        {gw2Key && !dailyLoading && dailyData && (() => {
          const completedSet = new Set(dailyData.completed)
          const pending = dailyData.all.filter(id => !completedSet.has(id))
          const done = dailyData.all.filter(id => completedSet.has(id))

          return (
            <div>
              {/* Pending */}
              {pending.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 9, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                    Available today ({pending.length})
                  </div>
                  {pending.map(id => (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 5 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.gold, flexShrink: 0 }} />
                      <div style={{ fontSize: 12, color: C.text, flex: 1 }}>{WORLD_BOSS_NAMES[id] || id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Completed */}
              {done.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                    Completed today ({done.length})
                  </div>
                  {done.map(id => (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#0a0e0a', border: `1px solid #1a2a1a`, borderRadius: 6, marginBottom: 5, opacity: 0.6 }}>
                      <div style={{ fontSize: 12, color: C.green, flexShrink: 0 }}>✓</div>
                      <div style={{ fontSize: 12, color: C.textDim, flex: 1, textDecoration: 'line-through' }}>{WORLD_BOSS_NAMES[id] || id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
                    </div>
                  ))}
                </div>
              )}

              {pending.length === 0 && done.length > 0 && (
                <div style={{ background: '#0a1a0a', border: '1px solid #1a3a1a', borderRadius: 8, padding: 12, textAlign: 'center', fontSize: 12, color: C.green }}>
                  ✓ All world bosses completed — resets in {resetIn}
                </div>
              )}
            </div>
          )
        })()}
      </div>

      <div style={{ marginTop: 14, padding: 10, background: '#0f0e0a', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 10, color: C.textFaint, textAlign: 'center', lineHeight: 1.6 }}>
        Schedules based on community-documented UTC rotations · Daily reset 00:00 UTC
      </div>
    </div>
  )
}

// ── Settings ─────────────────────────────────────────────────────────────────
function SettingsTab({ gw2Key, setGw2Key, accountData, setAccountData, accountContext, setAccountContext, spoilerFree, setSpoilerFree, voices, selectedVoice, setSelectedVoice }) {
  const [keyInput, setKeyInput] = useState(gw2Key)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [achSearch, setAchSearch] = useState('')
  const [achResults, setAchResults] = useState(null)
  const [achLoading, setAchLoading] = useState(false)

  const connect = async () => {
    if (!keyInput.trim()) return
    setLoading(true); setError('')
    try {
      const ctx = await fetchAccountContext(keyInput.trim())
      setGw2Key(keyInput.trim()); setAccountContext(ctx)
      const [acc, chars] = await Promise.all([
        gw2Fetch('/account', keyInput.trim()).catch(() => null),
        gw2Fetch('/characters?page=0', keyInput.trim()).catch(() => []),
      ])
      setAccountData({ account: acc, characters: chars })
      localStorage.setItem('gw2_api_key', keyInput.trim())
    } catch { setError('Invalid API key or connection error.') }
    setLoading(false)
  }

  const disconnect = () => {
    setGw2Key(''); setAccountData(null); setAccountContext(''); setKeyInput('')
    localStorage.removeItem('gw2_api_key')
  }

  const searchAch = async () => {
    if (!gw2Key || !achSearch.trim()) return
    setAchLoading(true); setAchResults(null)
    try {
      const ids = await fetch(`${GW2_API}/achievements/search?text=${encodeURIComponent(achSearch)}`).then(r => r.json())
      if (!ids.length) { setAchResults([]); setAchLoading(false); return }
      const details = await fetch(`${GW2_API}/achievements?ids=${ids.slice(0,5).join(',')}`).then(r => r.json())
      const acctAll = await gw2Fetch('/account/achievements', gw2Key).catch(() => [])
      const acctMap = Object.fromEntries(acctAll.map(a => [a.id, a]))
      setAchResults(details.map(d => ({
        name: d.name, description: d.requirement,
        done: acctMap[d.id]?.done ?? false,
        current: acctMap[d.id]?.current ?? 0,
        max: d.tiers?.[d.tiers.length-1]?.count ?? acctMap[d.id]?.max ?? '?',
      })))
    } catch { setAchResults([]) }
    setAchLoading(false)
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
      <Section title="Companion">
        <ToggleRow label="Spoiler-free mode" desc="Hides story outcomes and expansion endings. Say 'spoilers ok' in any question to override." value={spoilerFree} onChange={setSpoilerFree} />
      </Section>

      {voices.length > 1 && (
        <Section title="Voice">
          <select value={selectedVoice?.name || ''} onChange={e => setSelectedVoice(voices.find(v => v.name === e.target.value))}
            style={{ background: '#0f0e0a', border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 6, padding: '6px 10px', fontSize: 12, width: '100%', cursor: 'pointer' }}>
            {voices.filter(v => v.lang.startsWith('en')).map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
          </select>
        </Section>
      )}

      <Section title="GW2 Account">
        {accountData ? (
          <div>
            <div style={{ background: '#0f1a0f', border: '1px solid #1a3a1a', borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.green, marginBottom: 4 }}>✓ Connected — {accountData.account?.name}</div>
              {accountData.characters?.slice(0, 5).map(c => (
                <div key={c.name} style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>{c.name} · {c.race} {c.profession} Lv{c.level}</div>
              ))}
            </div>
            <button onClick={disconnect} style={{ background: '#1a0f0f', border: `1px solid #3a1a1a`, color: C.red, borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer', width: '100%' }}>
              Disconnect account
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 11, color: C.goldDim, marginBottom: 8, lineHeight: 1.6 }}>
              Get your API key at <span style={{ color: C.gold }}>account.arena.net → Applications</span>. Enable all character and account permissions.
            </div>
            <input value={keyInput} onChange={e => setKeyInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && connect()}
              placeholder="Paste GW2 API key…"
              style={{ background: '#0f0e0a', border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '8px 12px', fontSize: 11, width: '100%', fontFamily: 'monospace', marginBottom: 8, outline: 'none' }} />
            {error && <div style={{ fontSize: 11, color: C.red, marginBottom: 8 }}>{error}</div>}
            <button onClick={connect} disabled={loading || !keyInput.trim()} style={{ background: '#1a1408', border: `1px solid ${C.gold}44`, color: C.gold, borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%', opacity: !keyInput.trim() ? 0.4 : 1 }}>
              {loading ? 'Connecting…' : 'Connect account'}
            </button>
          </div>
        )}
      </Section>

      {gw2Key && (
        <Section title="Achievement Progress">
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input value={achSearch} onChange={e => setAchSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchAch()}
              placeholder="Search achievements…"
              style={{ flex: 1, background: '#0f0e0a', border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '7px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
            <button onClick={searchAch} disabled={achLoading} style={{ background: '#1a1408', border: `1px solid ${C.border}`, color: C.goldDim, borderRadius: 6, padding: '7px 12px', fontSize: 11, cursor: 'pointer' }}>
              {achLoading ? '…' : 'Search'}
            </button>
          </div>
          {achResults !== null && (achResults.length === 0
            ? <div style={{ fontSize:11, color:C.textFaint }}>No achievements found.</div>
            : achResults.map((a, i) => (
              <div key={i} style={{ background: '#0f0e0a', border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', marginBottom: 6 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 2 }}>
                  <div style={{ fontSize:11, fontWeight:700, color: a.done ? C.green : C.text }}>{a.name}</div>
                  <div style={{ fontSize:10, color: a.done ? C.green : C.goldDim, marginLeft:8, flexShrink:0 }}>{a.done ? '✓ Done' : `${a.current} / ${a.max}`}</div>
                </div>
                {!a.done && <div style={{ background:C.border, borderRadius:2, height:3, marginTop:4 }}><div style={{ background:C.gold, borderRadius:2, height:3, width:`${Math.min(100,(a.current/a.max)*100)}%` }} /></div>}
                {a.description && <div style={{ fontSize:10, color:C.textFaint, marginTop:4 }}>{a.description}</div>}
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
      <div style={{ fontSize: 9, fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color:C.goldDim, marginBottom:10, paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>{title}</div>
      {children}
    </div>
  )
}

function ToggleRow({ label, desc, value, onChange }) {
  return (
    <div style={{ display:'flex', gap:12, alignItems:'flex-start', marginBottom:8 }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:12, fontWeight:600, color:C.text, marginBottom:2 }}>{label}</div>
        <div style={{ fontSize:10, color:C.textFaint, lineHeight:1.5 }}>{desc}</div>
      </div>
      <button onClick={() => onChange(!value)} style={{ width:40, height:22, borderRadius:11, border:'none', cursor:'pointer', flexShrink:0, background: value ? C.gold : C.border, transition:'background 0.2s', position:'relative' }}>
        <div style={{ width:16, height:16, borderRadius:'50%', background:'#fff', position:'absolute', top:3, left: value ? 21 : 3, transition:'left 0.2s' }} />
      </button>
    </div>
  )
}

function InputBox({ onSend, disabled }) {
  const [value, setValue] = useState('')
  const submit = () => { if (value.trim() && !disabled) { onSend(value.trim()); setValue('') } }
  return (
    <>
      <input value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => e.key==='Enter' && submit()} disabled={disabled}
        placeholder="Type a question or use the mic…"
        style={{ flex:1, background:'#0f0e0a', border:`1px solid ${C.border}`, borderRadius:8, padding:'9px 12px', color:C.text, fontSize:13, outline:'none', fontFamily:'inherit', opacity: disabled ? 0.5 : 1 }} />
      <button onClick={submit} disabled={disabled || !value.trim()} style={{ background:'#1a1408', border:`1px solid ${C.gold}44`, color:C.gold, borderRadius:8, padding:'9px 14px', cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer', fontSize:18, opacity: disabled || !value.trim() ? 0.3 : 1, transition:'opacity 0.2s' }}>→</button>
    </>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
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
  const [spoilerFree, setSpoilerFree] = useState(() => localStorage.getItem('spoiler_free') === 'true')
  const [gw2Key, setGw2Key] = useState(() => localStorage.getItem('gw2_api_key') || '')
  const [accountData, setAccountData] = useState(null)
  const [accountContext, setAccountContext] = useState('')

  const recognitionRef = useRef(null)
  const synthRef = useRef(window.speechSynthesis)
  const historyRef = useRef([])

  useEffect(() => { localStorage.setItem('spoiler_free', spoilerFree) }, [spoilerFree])

  useEffect(() => {
    if (gw2Key) {
      fetchAccountContext(gw2Key).then(setAccountContext).catch(() => {})
      Promise.all([gw2Fetch('/account', gw2Key).catch(() => null), gw2Fetch('/characters?page=0', gw2Key).catch(() => [])])
        .then(([account, characters]) => setAccountData({ account, characters }))
    }
  }, [])

  useEffect(() => {
    const load = () => {
      const v = synthRef.current.getVoices()
      if (v.length) {
        setVoices(v)
        const p = v.find(x => x.name.includes('Google UK English Male')) || v.find(x => x.lang==='en-GB') || v.find(x => x.lang.startsWith('en')) || v[0]
        if (!selectedVoice) setSelectedVoice(p)
      }
    }
    load(); synthRef.current.onvoiceschanged = load
  }, [])

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setVoiceSupported(false); return }
    const rec = new SR()
    rec.continuous = false; rec.interimResults = true; rec.lang = 'en-GB'
    rec.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join('')
      setTranscript(t)
      if (e.results[e.results.length-1].isFinal) { setTranscript(''); handleQuery(t) }
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
    setIsThinking(true); setStatus('Thinking…')
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyRef.current, spoilerFree, accountContext }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'API error')
      const { reply, imageQuery } = data
      const imageUrl = imageQuery ? await fetchWikiImage(imageQuery) : null
      const assistantMsg = { role: 'assistant', content: reply, imageQuery, imageUrl }
      historyRef.current = [...historyRef.current, { role: 'assistant', content: reply }]
      setMessages(prev => [...prev, assistantMsg])
      setIsThinking(false); speak(reply)
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
      setIsThinking(false); setStatus('Error')
    }
  }, [speak, spoilerFree, accountContext])

  const toggleListen = () => {
    if (isListening) { recognitionRef.current?.stop() }
    else {
      synthRef.current.cancel(); setIsSpeaking(false)
      try { recognitionRef.current?.start(); setIsListening(true); setStatus('Listening…') }
      catch { setStatus('Mic unavailable') }
    }
  }

  const tabs = [
    { id: 'companion', label: '⚔️ Companion' },
    { id: 'events',    label: '⏱ Events' },
    { id: 'settings',  label: `⚙️ Settings${spoilerFree?' 🔒':''}${gw2Key?' ✓':''}` },
  ]

  return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', maxWidth:720, margin:'0 auto', background:C.bg }}>
      {/* Header */}
      <div style={{ background:`linear-gradient(180deg, ${C.surface} 0%, ${C.bg} 100%)`, borderBottom:`1px solid #2a2418`, padding:'12px 20px 0', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
          <div style={{ width:38, height:38, borderRadius:'50%', background:`linear-gradient(135deg, ${C.gold}, #8b6914)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, boxShadow:`0 0 14px ${C.gold}44`, flexShrink:0 }}>⚔️</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:700, color:'#e8d5a0', letterSpacing:'0.04em' }}>
              GW2 Companion
              {accountData?.account?.name && <span style={{ fontSize:11, color:C.goldDim, fontWeight:400, marginLeft:8 }}>· {accountData.account.name}</span>}
            </div>
            <div style={{ fontSize:10, color:C.goldDim, letterSpacing:'0.1em', textTransform:'uppercase' }}>{status}</div>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            {isSpeaking && <button onClick={() => { synthRef.current.cancel(); setIsSpeaking(false); setStatus('Ready') }} style={{ background:'#2a1a1a', border:`1px solid #5c2a2a`, color:C.red, borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer', fontWeight:600 }}>■ Stop</button>}
            {messages.length > 0 && <button onClick={() => { historyRef.current=[]; setMessages([]) }} style={{ background:'#1a1408', border:`1px solid ${C.border}`, color:C.goldDim, borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>Clear</button>}
          </div>
        </div>
        <div style={{ display:'flex' }}>
          {tabs.map(t => <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ background:'none', border:'none', cursor:'pointer', padding:'8px 16px', fontSize:12, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.1em', color: activeTab===t.id ? C.gold : C.goldDim, borderBottom: activeTab===t.id ? `2px solid ${C.gold}` : '2px solid transparent', marginBottom:-1, transition:'color 0.15s' }}>{t.label}</button>)}
        </div>
      </div>

      {activeTab === 'companion' && (
        <>
          <ChatMessages messages={messages} isThinking={isThinking} transcript={transcript} />
          <div style={{ flexShrink:0, borderTop:`1px solid #1a1610` }}>
            <div style={{ display:'flex', gap:8, padding:'10px 20px 8px' }}><InputBox onSend={handleQuery} disabled={isThinking || isListening} /></div>
            <div style={{ padding:'8px 20px 28px', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
              {!voiceSupported ? (
                <div style={{ fontSize:12, color:C.goldDim, textAlign:'center', padding:12, background:C.surface, border:`1px solid ${C.border}`, borderRadius:8 }}>Voice input requires Chrome or Edge.</div>
              ) : (
                <>
                  <button onClick={toggleListen} disabled={isThinking || isSpeaking} style={{ width:72, height:72, borderRadius:'50%', background: isListening ? 'radial-gradient(circle, #5c2a2a, #3a1010)' : 'radial-gradient(circle, #2a2010, #1a1408)', border:`2px solid ${isListening ? C.red : C.gold}`, cursor: isThinking||isSpeaking ? 'not-allowed' : 'pointer', fontSize:28, opacity: isThinking||isSpeaking ? 0.4 : 1, animation: isListening ? 'ring-pulse 1s ease-in-out infinite' : 'glow-idle 3s ease-in-out infinite', transition:'border-color 0.2s, background 0.2s' }}>
                    {isListening ? '🔴' : '🎙️'}
                  </button>
                  <div style={{ fontSize:11, color:C.goldDim, letterSpacing:'0.08em', textTransform:'uppercase' }}>
                    {isListening ? 'Listening — speak now' : isSpeaking ? 'Speaking…' : isThinking ? 'Thinking…' : 'Tap to speak'}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === 'events' && <EventTimers gw2Key={gw2Key} />}

      {activeTab === 'settings' && <SettingsTab gw2Key={gw2Key} setGw2Key={setGw2Key} accountData={accountData} setAccountData={setAccountData} accountContext={accountContext} setAccountContext={setAccountContext} spoilerFree={spoilerFree} setSpoilerFree={setSpoilerFree} voices={voices} selectedVoice={selectedVoice} setSelectedVoice={setSelectedVoice} />}

      <style>{`
        @keyframes pulse-dot { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1.2)} }
        @keyframes ring-pulse { 0%,100%{box-shadow:0 0 24px #e05c5c88,0 0 48px #e05c5c44} 50%{box-shadow:0 0 32px #e05c5ccc,0 0 60px #e05c5c66} }
        @keyframes glow-idle { 0%,100%{box-shadow:0 0 16px #c9a84c44} 50%{box-shadow:0 0 24px #c9a84c88} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0a0c0f} ::-webkit-scrollbar-thumb{background:#2a2010;border-radius:4px}
        input::placeholder{color:#4a3e28} select option{background:#12100a}
      `}</style>
    </div>
  )
}
