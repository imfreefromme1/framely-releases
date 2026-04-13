import { useState, useEffect } from "react";
import ActivationScreen from "./pages/ActivationScreen";
import Dashboard from "./pages/Dashboard";
import { getStoredLicense, validateStoredLicense } from "./lib/license";

// ── Font import ───────────────────────────────────────────
if (!document.getElementById("framely-fonts")) {
  const link = document.createElement("link");
  link.id = "framely-fonts";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap";
  document.head.appendChild(link);
}

// ── Design tokens ─────────────────────────────────────────
export const C = {
  bg0:       "#080808",
  bg1:       "#0d0d0d",
  bg2:       "#111111",
  bg3:       "#1a1a1a",
  border:    "#2a2318",
  borderGold:"#c9a84c",
  gold:      "#c9a84c",
  goldLight: "#e8c96a",
  goldDim:   "#6b5a28",
  goldGlow:  "rgba(201,168,76,0.12)",
  fontUI:    "'Rajdhani', 'Segoe UI', system-ui, sans-serif",
  fontMono:  "'Share Tech Mono', 'Courier New', monospace",
  text:      "#f0e8d0",
  textMid:   "#8a7a5a",
  textDim:   "#3a3226",
};

export default function App() {
  const [activated, setActivated] = useState(false);
  const [checking, setChecking]   = useState(true);

  useEffect(() => {
    async function check() {
      const stored = getStoredLicense();
      // Run validation + minimum splash time in parallel
      const [valid] = await Promise.all([
        stored ? validateStoredLicense(stored) : Promise.resolve(false),
        new Promise(r => setTimeout(r, 2500)),
      ]);
      if (stored) setActivated(valid);
      setChecking(false);
    }
    check();
  }, []);

  if (checking)    return <Splash />;
  if (!activated)  return <ActivationScreen onActivated={() => setActivated(true)} />;
  return <Dashboard />;
}

// ── Splash ────────────────────────────────────────────────
function Splash() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 600),
      setTimeout(() => setPhase(3), 1100),
      setTimeout(() => setPhase(4), 1600),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", background: C.bg0,
      overflow: "hidden", position: "relative",
    }}>
      <style>{`
        @keyframes scan {
          0%   { top: 36px; opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { top: calc(100vh - 1px); opacity: 0; }
        }
        @keyframes pulse-glow {
          0%, 100% { filter: drop-shadow(0 0 8px #c9a84c44); }
          50%       { filter: drop-shadow(0 0 28px #c9a84caa); }
        }
        @keyframes flicker {
          0%, 100% { opacity: 1; }
          92%      { opacity: 1; }
          93%      { opacity: 0.5; }
          94%      { opacity: 1; }
          97%      { opacity: 0.7; }
          98%      { opacity: 1; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0; }
        }
      `}</style>

      <div style={{ position: "absolute", top: 36, left: 0, right: 0, height: 1, background: "linear-gradient(to right, transparent, #6b5a28, transparent)", opacity: phase >= 2 ? 1 : 0, transform: phase >= 2 ? "scaleX(1)" : "scaleX(0)", transition: "all 0.8s ease" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1, background: "linear-gradient(to right, transparent, #6b5a28, transparent)", opacity: phase >= 2 ? 1 : 0, transform: phase >= 2 ? "scaleX(1)" : "scaleX(0)", transition: "all 0.8s ease 0.1s" }} />

      {[
        { top: 40, left: 20, borderTop: "1px solid #6b5a28", borderLeft: "1px solid #6b5a28" },
        { top: 40, right: 20, borderTop: "1px solid #6b5a28", borderRight: "1px solid #6b5a28" },
        { bottom: 10, left: 20, borderBottom: "1px solid #6b5a28", borderLeft: "1px solid #6b5a28" },
        { bottom: 10, right: 20, borderBottom: "1px solid #6b5a28", borderRight: "1px solid #6b5a28" },
      ].map((style, i) => (
        <div key={i} style={{ position: "absolute", width: 20, height: 20, ...style, opacity: phase >= 2 ? 1 : 0, transition: `opacity 0.4s ease ${0.1 * i}s` }} />
      ))}

      {phase >= 2 && (
        <div style={{ position: "absolute", left: 0, right: 0, height: 1, background: "linear-gradient(to right, transparent, #c9a84c33, transparent)", animation: "scan 2.5s ease-in-out infinite" }} />
      )}

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, opacity: phase >= 1 ? 1 : 0, transform: phase >= 1 ? "translateY(0)" : "translateY(24px)", transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)", animation: phase >= 4 ? "pulse-glow 3s ease infinite" : "none" }}>
        <FramelyLogo size={68} />
        <div style={{ opacity: phase >= 3 ? 1 : 0, transform: phase >= 3 ? "translateY(0)" : "translateY(10px)", transition: "all 0.6s ease", textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.gold, letterSpacing: "0.45em", textTransform: "uppercase", fontFamily: C.fontUI, animation: phase >= 4 ? "flicker 6s ease infinite" : "none" }}>Framely</div>
          <div style={{ fontSize: 9, color: C.textDim, letterSpacing: "0.32em", textTransform: "uppercase", fontFamily: C.fontUI, marginTop: 8 }}>PC Optimizer for Gamers</div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 24, display: "flex", alignItems: "center", gap: 8, opacity: phase >= 3 ? 1 : 0, transition: "opacity 0.5s ease 0.4s" }}>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.gold, animation: phase >= 4 ? "blink 1.2s ease infinite" : "none" }} />
        <span style={{ fontSize: 9, color: C.textDim, letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: C.fontMono }}>Initializing</span>
      </div>
    </div>
  );
}

export function FramelyLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <rect width="100" height="100" rx="18" fill="#0d0d0d" stroke={C.goldDim} strokeWidth="1.5"/>
      <polygon points="22,20 78,20 78,34 38,34 38,46 70,46 70,58 38,58 38,80 22,80" fill={C.gold} opacity="0.95"/>
      <polygon points="22,20 78,20 78,34 38,34 38,46 70,46 70,58 38,58 38,80 22,80" fill="none" stroke={C.goldLight} strokeWidth="0.5" opacity="0.4"/>
    </svg>
  );
}

export function TitleBar() {
  async function minimize() { if (window.__TAURI__) { const { appWindow } = await import("@tauri-apps/api/window"); appWindow.minimize(); } }
  async function maximize() { if (window.__TAURI__) { const { appWindow } = await import("@tauri-apps/api/window"); appWindow.toggleMaximize(); } }
  async function close()    { if (window.__TAURI__) { const { appWindow } = await import("@tauri-apps/api/window"); appWindow.close(); } }

  return (
    <div data-tauri-drag-region style={{ position: "fixed", top: 0, left: 0, right: 0, height: 36, background: C.bg0, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", zIndex: 1000, userSelect: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <FramelyLogo size={17} />
        <span style={{ fontSize: 11, color: C.goldDim, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 500 }}>Framely</span>
      </div>
      <div style={{ display: "flex", gap: 7 }}>
        {[
          { fn: minimize, color: "#3a3226" },
          { fn: maximize, color: "#3a3226" },
          { fn: close,    color: "#4a2a18" },
        ].map(({ fn, color }, i) => (
          <div key={i} onClick={fn}
            onMouseEnter={e => e.currentTarget.style.background = i === 2 ? "#8b3a22" : C.goldDim}
            onMouseLeave={e => e.currentTarget.style.background = color}
            style={{ width: 11, height: 11, borderRadius: "50%", background: color, cursor: "pointer", transition: "background 0.15s" }}
          />
        ))}
      </div>
    </div>
  );
}