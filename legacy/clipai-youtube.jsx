import { useState, useRef } from "react";

function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const r of patterns) {
    const m = url.match(r);
    if (m) return m[1];
  }
  return null;
}

function parseJSON(raw) {
  const clean = raw.replace(/```json|```/g, "").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in: " + clean.slice(0, 200));
  return JSON.parse(match[0]);
}

// Calls Claude with web_search, handles the full agentic tool-use loop
async function callWithWebSearch(system, userMsg) {
  let messages = [{ role: "user", content: userMsg }];

  for (let turn = 0; turn < 10; turn++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages,
      }),
    });

    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e?.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const { stop_reason, content } = data;

    // Always append assistant response to history
    messages.push({ role: "assistant", content });

    if (stop_reason === "end_turn") {
      // Extract text from content blocks
      const text = content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("")
        .trim();
      if (!text) throw new Error("Empty response from Claude");
      return text;
    }

    if (stop_reason === "tool_use") {
      // Find all tool_use blocks and respond to each
      const toolUseBlocks = content.filter(b => b.type === "tool_use");
      if (toolUseBlocks.length === 0) {
        // No tool_use blocks but stop_reason is tool_use — extract any text
        const text = content.filter(b => b.type === "text").map(b => b.text).join("").trim();
        if (text) return text;
        throw new Error("tool_use stop but no tool_use blocks found");
      }

      // Build tool_result for each tool_use block
      // web_search results are already embedded in the tool_use block content
      const toolResults = toolUseBlocks.map(block => ({
        type: "tool_result",
        tool_use_id: block.id,
        // For web_search, the results come back in block.content as an array
        content: Array.isArray(block.content)
          ? block.content
          : (typeof block.content === "string" ? block.content : "Search completed, please analyze and respond with JSON."),
      }));

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // Unexpected stop reason — try to get text anyway
    const text = content.filter(b => b.type === "text").map(b => b.text).join("").trim();
    if (text) return text;
    throw new Error(`Unexpected stop_reason: ${stop_reason}`);
  }

  throw new Error("Agent loop exceeded max turns");
}

// Pure Claude call without tools
async function callClaude(system, userMsg) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
}



function ScoreBar({ score }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 10, color: "#6b6b80", fontWeight: 500 }}>Viral</span>
      <div style={{ flex: 1, height: 3, background: "#ffffff0d", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${score}%`, background: "linear-gradient(90deg,#7c6af7,#a78bfa)", borderRadius: 2, transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)" }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", minWidth: 28, textAlign: "right" }}>{score}%</span>
    </div>
  );
}

function ClipCard({ clip, index, onCopy }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      onClick={() => { onCopy(clip); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
      style={{ background: "#16161f", border: "1px solid #ffffff0d", borderRadius: 14, padding: 18, cursor: "pointer", position: "relative", overflow: "hidden", transition: "all 0.2s" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#7c6af755"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#ffffff0d"; e.currentTarget.style.transform = "none"; }}
    >
      <div style={{ position: "absolute", top: 14, right: 14, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: "#7c6af722", color: "#a78bfa", border: "1px solid #7c6af733" }}>
        #{clip.rank || index + 1}
      </div>
      <div style={{ display: "flex", gap: 5, marginBottom: 10, flexWrap: "wrap" }}>
        {(clip.platforms || ["TikTok"]).map(p => (
          <span key={p} style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: "#111118", border: "1px solid #ffffff1a", color: "#6b6b80" }}>{p}</span>
        ))}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, marginBottom: 8, paddingRight: 40, color: "#e8e8f0" }}>{clip.title}</div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#a78bfa", fontWeight: 600, background: "#7c6af711", padding: "3px 8px", borderRadius: 5, marginBottom: 10 }}>
        ⏱ {clip.start} → {clip.end}
      </div>
      <p style={{ fontSize: 12.5, color: "#6b6b80", lineHeight: 1.55, marginBottom: clip.hook ? 8 : 14 }}>{clip.why}</p>
      {clip.hook && <p style={{ fontSize: 12, color: "#a78bfa88", marginBottom: 14 }}>🎣 <em style={{ color: "#a78bfa" }}>{clip.hook}</em></p>}
      <ScoreBar score={clip.viralScore} />
      {copied && (
        <div style={{ position: "absolute", inset: 0, background: "#7c6af722", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#a78bfa", fontWeight: 600, backdropFilter: "blur(2px)" }}>
          ✓ Copiado
        </div>
      )}
    </div>
  );
}

const STEPS = [
  "Buscando información del video...",
  "Extrayendo transcripción...",
  "Analizando momentos clave...",
  "Generando clips virales...",
];

export default function ClipAI() {
  const [url, setUrl]             = useState("");
  const [platform, setPlatform]   = useState("all");
  const [clipCount, setClipCount] = useState("8");
  const [tone, setTone]           = useState("viral");
  const [loading, setLoading]     = useState(false);
  const [step, setStep]           = useState(0);
  const [error, setError]         = useState("");
  const [debugLog, setDebugLog]   = useState("");
  const [result, setResult]       = useState(null);
  const [videoMeta, setVideoMeta] = useState(null);
  const [toast, setToast]         = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const outputRef = useRef(null);

  const log = msg => setDebugLog(prev => prev + "\n" + msg);
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 2400); };

  const analyze = async () => {
    const trimmed = url.trim();
    if (!trimmed) { setError("Pega un link de YouTube."); return; }
    const videoId = extractVideoId(trimmed);
    if (!videoId) { setError("Link no reconocido. Usa: https://youtube.com/watch?v=XXXX"); return; }

    setError(""); setResult(null); setVideoMeta(null); setDebugLog("");
    setLoading(true); setStep(0);

    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      log(`[1] Fetching transcript for: ${videoUrl}`);

      // ── STEP 1: Get transcript via web_search ──
      const transcriptText = await callWithWebSearch(
        `You are a helpful assistant that retrieves YouTube video transcripts.
Use web_search to find the transcript or subtitles of the given video.
Search for the video title first, then search for "[video title] transcript" or "[video title] subtitles".
After searching, respond with ONLY a valid JSON object, no markdown, no explanation:
{
  "title": "video title here",
  "channel": "channel name",
  "duration": "estimated duration",
  "transcript": "full transcript text with as much content as possible, minimum 300 words"
}
If you cannot find a full transcript, include whatever content you found about the video.`,
        `Get the transcript for this YouTube video: ${videoUrl} (video ID: ${videoId})`
      );

      log(`[2] Raw transcript response (first 300 chars): ${transcriptText.slice(0, 300)}`);

      let transcriptData;
      try {
        transcriptData = parseJSON(transcriptText);
        log(`[3] Parsed OK. Title: ${transcriptData.title}, transcript length: ${transcriptData.transcript?.length}`);
      } catch (parseErr) {
        log(`[3] Parse failed: ${parseErr.message}`);
        throw new Error(`No se pudo parsear la transcripción. Detalle: ${parseErr.message}`);
      }

      if (!transcriptData.transcript || transcriptData.transcript.length < 50) {
        throw new Error("El video no tiene transcripción disponible públicamente. Prueba con otro video (podcasts o charlas populares funcionan mejor).");
      }

      setVideoMeta({
        title: transcriptData.title || "Video de YouTube",
        channel: transcriptData.channel || "",
        duration: transcriptData.duration || "",
        videoId,
      });

      // ── STEP 2: Generate clips (no web_search needed) ──
      setStep(2);
      log(`[4] Analyzing clips...`);

      const platformMap = { all: "TikTok, Instagram Reels y YouTube Shorts", tiktok: "TikTok", reels: "Instagram Reels", shorts: "YouTube Shorts" };
      const toneMap = { viral: "maximum viral potential and engagement", educational: "valuable educational content", emotional: "strong emotional impact", controversial: "controversial or surprising perspectives" };

      const clipsText = await callClaude(
        `You are an expert in viral content strategy and video clipping for social media.
Analyze the transcript and identify the best moments for short viral clips.
Respond with ONLY a valid JSON object, no markdown, no extra text:
{
  "summary": "2-3 sentence summary of the video",
  "mainTopic": "main topic of the video",
  "clips": [
    {
      "rank": 1,
      "title": "catchy clip title",
      "start": "MM:SS",
      "end": "MM:SS",
      "platforms": ["TikTok", "Reels"],
      "viralScore": 87,
      "why": "why this moment has viral potential",
      "hook": "hook for the first 3 seconds"
    }
  ]
}
Generate exactly ${clipCount} clips ordered by viralScore descending.
Target platforms: ${platformMap[platform]}.
Main criterion: ${toneMap[tone]}.
viralScore between 60-99. Use realistic timestamps based on the content.`,
        `Video: "${transcriptData.title}" by ${transcriptData.channel}\n\nTranscript:\n${transcriptData.transcript}\n\nGenerate ${clipCount} viral clips.`
      );

      log(`[5] Clips response (first 200): ${clipsText.slice(0, 200)}`);

      setStep(3);
      const clipsData = parseJSON(clipsText);
      log(`[6] Clips parsed OK. Count: ${clipsData.clips?.length}`);

      setResult(clipsData);
      setTimeout(() => outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);

    } catch (err) {
      log(`[ERROR] ${err.message}`);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyClip = clip => {
    navigator.clipboard.writeText(`📎 ${clip.title}\n⏱ ${clip.start} → ${clip.end}\n\n${clip.why}\n\n🎣 Hook: ${clip.hook || ""}`).catch(() => {});
    showToast("✓ Clip copiado");
  };

  const sel = { background: "#111118", border: "1px solid #ffffff0d", borderRadius: 8, padding: "9px 12px", color: "#e8e8f0", fontSize: 12.5, outline: "none", cursor: "pointer", flex: 1 };

  return (
    <div style={{ background: "#0a0a0f", minHeight: "100vh", color: "#e8e8f0", fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 28px", borderBottom: "1px solid #ffffff0d" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#7c6af7,#a78bfa)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>✦</div>
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>Clip<span style={{ color: "#6b6b80", fontWeight: 400 }}>AI</span></span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setShowDebug(v => !v)} style={{ background: "none", border: "1px solid #ffffff1a", borderRadius: 6, padding: "4px 10px", color: "#6b6b80", fontSize: 11, cursor: "pointer" }}>
            {showDebug ? "Ocultar" : "Debug"}
          </button>
          <div style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: "#7c6af733", color: "#a78bfa", border: "1px solid #7c6af744", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Claude AI
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 60px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Hero */}
        <div style={{ textAlign: "center", padding: "16px 0 24px" }}>
          <h1 style={{ fontSize: "clamp(24px,4vw,42px)", fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.15, marginBottom: 10 }}>
            Pega un link de YouTube,<br />
            <span style={{ background: "linear-gradient(90deg,#a78bfa,#c4b5fd,#7c6af7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>obtén clips virales</span>
          </h1>
          <p style={{ fontSize: 14, color: "#6b6b80", lineHeight: 1.6 }}>La IA extrae la transcripción y detecta los mejores momentos virales.</p>
        </div>

        {/* Input card */}
        <div style={{ background: "#16161f", border: "1px solid #ffffff0d", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #ffffff0d", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13 }}>🔗</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Link de YouTube</span>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <input
                value={url}
                onChange={e => { setUrl(e.target.value); setError(""); }}
                onKeyDown={e => e.key === "Enter" && !loading && analyze()}
                placeholder="https://www.youtube.com/watch?v=..."
                style={{ flex: 1, background: "#111118", border: "1px solid #ffffff0d", borderRadius: 10, padding: "12px 16px", color: "#e8e8f0", fontSize: 13.5, outline: "none", fontFamily: "inherit" }}
                onFocus={e => e.target.style.borderColor = "#7c6af766"}
                onBlur={e => e.target.style.borderColor = "#ffffff0d"}
              />
              <button
                onClick={analyze} disabled={loading}
                style={{ background: loading ? "#2a2440" : "linear-gradient(135deg,#7c6af7,#6d5ce7)", color: "#fff", border: "none", borderRadius: 10, padding: "0 22px", fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, whiteSpace: "nowrap", minWidth: 110 }}
              >
                {loading ? "Analizando..." : "✦ Analizar"}
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <select value={platform} onChange={e => setPlatform(e.target.value)} style={sel}>
                <option value="all"> Todas</option>
                <option value="tiktok">TikTok</option>
                <option value="reels">Reels</option>
                <option value="shorts">Shorts</option>
              </select>
              <select value={clipCount} onChange={e => setClipCount(e.target.value)} style={sel}>
                <option value="5">5 clips</option>
                <option value="8">8 clips</option>
                <option value="12">12 clips</option>
              </select>
              <select value={tone} onChange={e => setTone(e.target.value)} style={sel}>
                <option value="viral"> Viral</option>
                <option value="educational">Educativo</option>
                <option value="emotional"> Emocional</option>
                <option value="controversial">Controversial</option>
              </select>
            </div>

            {/* Loading */}
            {loading && (
              <div style={{ marginTop: 14, padding: 16, background: "#111118", borderRadius: 10, border: "1px solid #ffffff0d" }}>
                {STEPS.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: i < STEPS.length - 1 ? 10 : 0, opacity: i > step ? 0.3 : 1, transition: "opacity 0.3s" }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: "1.5px solid", borderColor: i < step ? "#4ade8066" : i === step ? "#7c6af7" : "#ffffff1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>
                      {i < step ? "✓" : i === step
                        ? <div style={{ width: 9, height: 9, border: "1.5px solid #7c6af7", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                        : "·"}
                    </div>
                    <span style={{ fontSize: 12, color: i === step ? "#e8e8f0" : i < step ? "#4ade80" : "#6b6b80" }}>{s}</span>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div style={{ marginTop: 12, padding: "12px 16px", background: "#f8717111", border: "1px solid #f8717133", borderRadius: 10, fontSize: 13, color: "#f87171", lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            {/* Debug log */}
            {showDebug && debugLog && (
              <pre style={{ marginTop: 12, padding: 12, background: "#050508", border: "1px solid #ffffff0d", borderRadius: 8, fontSize: 11, color: "#6b6b80", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 200, overflow: "auto" }}>
                {debugLog}
              </pre>
            )}
          </div>
        </div>

        {/* Results */}
        {result && (
          <div ref={outputRef} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {videoMeta && (
              <div style={{ background: "#16161f", border: "1px solid #ffffff0d", borderRadius: 14, padding: 18, display: "flex", gap: 16, alignItems: "center" }}>
                <img src={`https://img.youtube.com/vi/${videoMeta.videoId}/mqdefault.jpg`} alt="" style={{ width: 110, height: 62, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{videoMeta.title}</div>
                  <div style={{ fontSize: 12, color: "#6b6b80" }}>{videoMeta.channel}{videoMeta.duration ? ` · ${videoMeta.duration}` : ""}</div>
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
              {[
                { num: result.clips?.length, label: "Clips" },
                { num: Math.round((result.clips||[]).reduce((a,c) => a+c.viralScore,0)/(result.clips?.length||1))+"%", label: "Score promedio" },
                { num: [...new Set((result.clips||[]).flatMap(c=>c.platforms||[]))].length, label: "Plataformas" },
              ].map((s,i) => (
                <div key={i} style={{ background: "#16161f", border: "1px solid #ffffff0d", borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 26, fontWeight: 700, background: "linear-gradient(90deg,#a78bfa,#c4b5fd)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{s.num}</div>
                  <div style={{ fontSize: 11, color: "#6b6b80", marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ background: "#16161f", border: "1px solid #ffffff0d", borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "#6b6b80", marginBottom: 10 }}>Análisis</div>
              <p style={{ fontSize: 13.5, color: "#6b6b80", lineHeight: 1.7 }}>
                <strong style={{ color: "#e8e8f0" }}>{result.mainTopic}</strong> — {result.summary}
              </p>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "#6b6b80", paddingBottom: 12, borderBottom: "1px solid #ffffff0d", marginBottom: 14 }}>
                Clips — por potencial viral
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14 }}>
                {(result.clips||[]).map((clip,i) => <ClipCard key={i} clip={clip} index={i} onCopy={copyClip} />)}
              </div>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#16161f", border: "1px solid #ffffff1a", borderRadius: 10, padding: "11px 20px", fontSize: 13, color: "#e8e8f0", boxShadow: "0 8px 32px #00000066", zIndex: 100, whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}input::placeholder{color:#6b6b80}select option{background:#16161f}`}</style>
    </div>
  );
}