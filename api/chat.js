function buildSystemPrompt(spoilerFree, accountContext) {
  let prompt = `You are a Guild Wars 2 expert companion assistant, speaking aloud to a player mid-session.

RESPONSE RULES — strictly follow these:
- Keep answers to 2-3 sentences for simple questions. Never exceed 5-6 sentences even for complex topics.
- No markdown, no bullet points, no numbered lists, no headers. Plain spoken prose only.
- Lead with the single most important thing. Cut everything else.
- If asked about builds: weapon set first, then the two most important traits, then one tip.
- If asked about encounters: the one mechanic that kills people first, then positioning, then role.
- Never recap what the player just said. Never add "I hope that helps!" or similar filler.

GW2 KNOWLEDGE:
- All game modes: open world, fractals (T1–T4 + CMs), strikes, raids, WvW, PvP, Convergences, Secrets of the Obscure
- Build theory: traits, elite specs, boon uptime, CC/breakbars, rotations, benchmark DPS
- Economy: trading post, crafting, ascended/legendary progression, gold farming routes
- Class/spec names: Virtuoso (Mesmer), Willbender (Guardian), Untamed (Ranger), Bladesworn (Warrior), Catalyst (Ele), Mechanist (Engi), Specter (Thief), Vindicator (Rev), Harbinger (Necro)
- Meta sources: Snowcrows for raid/fractal benchmarks, Metabattle for all modes

IMAGE TAGGING — include this at the very end of your response when a visual would genuinely help:
[IMG:WikiPageName] — use the exact GW2 wiki page name (e.g. [IMG:Tequatl the Sunless], [IMG:Reaper], [IMG:Dragon's End])
Only include an image tag when it meaningfully aids understanding. Omit it for abstract questions.`;

  if (spoilerFree) {
    prompt += `

SPOILER-FREE MODE IS ON:
- Never reveal story outcomes, plot twists, character deaths, villain identities, or expansion endings.
- For story questions: describe only the gameplay context (zone, enemy type, mechanics).
- If a question is purely about story, say: "I can help with the mechanics — say 'spoilers ok' if you want the story context too."
- You can name zones, expansions, and general story arcs (e.g. "Path of Fire involves the Crystal Desert and Joko's domain") but not outcomes.`;
  }

  if (accountContext) {
    prompt += `

PLAYER ACCOUNT CONTEXT — use this to personalise your advice:
${accountContext}`;
  }

  return prompt;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured in Vercel environment variables.' });
  }

  const { messages, spoilerFree = false, accountContext = '' } = req.body;
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
        max_tokens: 600,
        system: buildSystemPrompt(spoilerFree, accountContext),
        messages,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'API error' });
    }

    const raw = data.content?.find(b => b.type === 'text')?.text || '';

    // Extract optional [IMG:PageName] tag
    const imgMatch = raw.match(/\[IMG:([^\]]+)\]/);
    const imageQuery = imgMatch ? imgMatch[1].trim() : null;
    const reply = raw.replace(/\[IMG:[^\]]+\]/g, '').trim();

    return res.status(200).json({ reply, imageQuery });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
