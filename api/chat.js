const SYSTEM_PROMPT = `You are a Guild Wars 2 expert companion assistant. You have deep knowledge of:
- All GW2 game modes: open world, fractals, strikes, raids, WvW, PvP, Convergences, Secrets of the Obscure
- Build theory: traits, specialisations, elite specs, boon uptime, CC (breakbars), rotations
- Economy: trading post, crafting, ascended/legendary gear progression, gold farming
- Lore, story, living world, expansion content
- Current meta builds from Snowcrows (raid/fractal benchmarks) and Metabattle (all modes)
- Class/spec nicknames: Virtuoso (Mesmer elite), Willbender (Guardian elite), Untamed (Ranger), Bladesworn (Warrior), Catalyst (Ele), Mechanist (Engi), Specter (Thief), Vindicator (Rev), Harbinger (Necro)

Keep answers concise and spoken-word friendly — you are being read aloud. Avoid markdown, bullet points, or long lists. Speak naturally as if talking to a friend mid-session. If asked about builds, give the key traits and weapons first. If asked about encounters, lead with the most critical mechanic to watch for. If you are unsure about current patch data, say so and give your best general advice.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured in Vercel environment variables.' });
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'API error' });
    }

    const text = data.content?.find(b => b.type === 'text')?.text || '';
    return res.status(200).json({ reply: text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
