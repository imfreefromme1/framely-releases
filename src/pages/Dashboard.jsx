import { useState, useEffect, useRef } from "react";
import { FramelyLogo, TitleBar, C } from "../App";
import { clearLicense, getLicenseExpiry } from "../lib/license";
import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

// ─── License Gate ─────────────────────────────────────────────────────────────
function LicenseGate({ children }) {
  const [phase, setPhase] = useState("checking"); // checking | gate | unlocked
  const [key, setKey]     = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy]   = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await invoke("get_saved_license");
        if (!saved) { setPhase("gate"); return; }
        const machineId = await invoke("get_machine_id");
        const raw = await invoke("validate_license", { key: saved, machineId });
        const res = JSON.parse(raw);
        if (res.valid) {
          try { localStorage.setItem("framely_license", JSON.stringify({ expiresAt: res.expires_at ? Number(res.expires_at) * 1000 : null, plan: res.plan })); } catch {}
          setPhase("unlocked");
        } else {
          await invoke("clear_license");
          setPhase("gate");
        }
      } catch {
        setPhase("gate");
      }
    })();
  }, []);

  async function handleActivate() {
    if (!key.trim()) { setError("Please enter your license key."); return; }
    setBusy(true); setError("");
    try {
      const machineId = await invoke("get_machine_id");
      const raw = await invoke("validate_license", { key: key.trim(), machineId });
      const res = JSON.parse(raw);
      if (!res.valid) { setError(res.reason || "Invalid license key."); setBusy(false); return; }
      await invoke("save_license", { key: key.trim() });
      try { localStorage.setItem("framely_license", JSON.stringify({ expiresAt: res.expires_at ? Number(res.expires_at) * 1000 : null, plan: res.plan })); } catch {}
      setPhase("unlocked");
    } catch(e) {
      setError(typeof e === "string" ? e : "Activation failed. Check your connection.");
    }
    setBusy(false);
  }

  if (phase === "checking") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg0, flexDirection: "column", gap: 16 }}>
        <TitleBar />
        <div style={{ width: 28, height: 28, border: `2px solid ${C.gold}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        <div style={{ fontSize: 12, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase" }}>Verifying license…</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (phase === "gate") {
    return (
      <div style={{ display: "flex", height: "100vh", background: C.bg0, color: C.text, fontFamily: C.fontUI }}>
        <TitleBar />
        <div style={{ margin: "auto", width: 400, padding: "40px 36px", background: C.bg1, border: `1px solid ${C.border}`, borderTop: `1px solid ${C.goldDim}`, borderRadius: 14, boxShadow: "0 32px 100px rgba(0,0,0,0.6)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
            <FramelyLogo size={32} />
            <span style={{ fontSize: 18, fontWeight: 700, color: C.gold, letterSpacing: "0.22em", textTransform: "uppercase" }}>Framely</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Activate your license</div>
          <p style={{ fontSize: 12, color: C.textMid, lineHeight: 1.7, marginBottom: 22 }}>
            Enter the license key from your{" "}
            <a href="https://whop.com/getframely/" target="_blank" rel="noreferrer" style={{ color: C.gold, textDecoration: "none" }}>Whop purchase</a>.
          </p>
          <input
            type="text"
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleActivate()}
            placeholder="e.g. mem_xxxxxxxxxxxxxxxx"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "11px 14px", borderRadius: 7,
              background: C.bg2, border: `1px solid ${error ? "#c05050" : C.border}`,
              color: C.text, fontSize: 13, fontFamily: C.fontMono,
              outline: "none", marginBottom: 8,
            }}
          />
          {error && <div style={{ fontSize: 11, color: "#e07070", marginBottom: 10, letterSpacing: "0.04em" }}>✗ {error}</div>}
          <button
            onClick={handleActivate}
            disabled={busy}
            style={{
              width: "100%", padding: "11px 0", borderRadius: 7, border: "none",
              background: busy ? C.bg3 : C.gold, color: busy ? C.textDim : "#080808",
              fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
              cursor: busy ? "wait" : "pointer", fontFamily: C.fontUI,
              transition: "all 0.2s", marginBottom: 18,
            }}
          >
            {busy ? "Verifying…" : "Activate"}
          </button>
          <div style={{ fontSize: 11, color: C.textDim, textAlign: "center", lineHeight: 1.8 }}>
            Don't have a license?{" "}
            <a href="https://whop.com/getframely/" target="_blank" rel="noreferrer" style={{ color: C.gold, textDecoration: "none" }}>Purchase here</a>
            {" · "}
            <a href="https://discord.gg/framely" target="_blank" rel="noreferrer" style={{ color: C.textDim, textDecoration: "none" }}>Support</a>
          </div>
        </div>
      </div>
    );
  }

  return children;
}

export { LicenseGate };

const HISTORY_KEY = "framely_history";
function historyGet() {
  try { return JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}
function historyAdd(label, result, ok) {
  const entries = historyGet();
  entries.unshift({
    id: Date.now(),
    time: new Date().toLocaleTimeString(),
    date: new Date().toLocaleDateString(),
    label,
    result: typeof result === "string" ? result : (ok ? "Done" : "Failed"),
    ok,
  });
  sessionStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 200)));
  window.dispatchEvent(new Event("framely_history_updated"));
}

// ─── Toast system ────────────────────────────────────────────────────────────
let toastId = 0;
const toastListeners = new Set();
function showToast(message, type = "success") {
  const id = ++toastId;
  toastListeners.forEach(fn => fn({ id, message, type }));
}

function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    const handler = (toast) => {
      setToasts(t => [...t, toast]);
      setTimeout(() => setToasts(t => t.filter(x => x.id !== toast.id)), 3200);
    };
    toastListeners.add(handler);
    return () => toastListeners.delete(handler);
  }, []);
  if (!toasts.length) return null;
  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: "10px 16px", borderRadius: 8, fontSize: 13, fontFamily: C.fontUI, fontWeight: 600,
          letterSpacing: "0.06em", animation: "slideIn 0.25s ease",
          background: t.type === "error" ? "#2a1010" : "#0d1a0d",
          border: `1px solid ${t.type === "error" ? "#c05050" : C.gold}`,
          color: t.type === "error" ? "#e07070" : C.gold,
          boxShadow: `0 4px 20px ${t.type === "error" ? "rgba(192,80,80,0.15)" : "rgba(212,170,60,0.15)"}`,
        }}>
          {t.type === "error" ? "✗" : "✓"} {t.message}
        </div>
      ))}
      <style>{`@keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }`}</style>
    </div>
  );
}

// ─── Deactivate confirmation modal ────────────────────────────────────────────
function DeactivateModal({ onClose, onConfirm }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#111008", border: `1px solid #3a3226`,
          borderTop: `1px solid #5a4a30`,
          borderRadius: 12, padding: "28px 32px", width: 360,
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          animation: "modalIn 0.2s ease",
        }}
      >
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#2a1010", border: "1px solid #c05050", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 3v6" stroke="#e07070" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="9" cy="13" r="1" fill="#e07070"/>
            <circle cx="9" cy="9" r="7.5" stroke="#e07070" strokeWidth="1.2"/>
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: C.fontUI, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Deactivate License?</div>
        <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.7, marginBottom: 24 }}>
          This will remove your license from this device. You'll need to re-enter your key to use Framely again.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: "9px 0", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textMid, fontSize: 13, fontFamily: C.fontUI, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.goldDim; e.currentTarget.style.color = C.text; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMid; }}
          >Cancel</button>
          <button
            onClick={onConfirm}
            style={{ flex: 1, padding: "9px 0", borderRadius: 6, border: "1px solid #c05050", background: "#2a1010", color: "#e07070", fontSize: 13, fontFamily: C.fontUI, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#3a1515"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#2a1010"; }}
          >Deactivate</button>
        </div>
      </div>
      <style>{`@keyframes modalIn { from { opacity: 0; transform: scale(0.95) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }`}</style>
    </div>
  );
}

const NAV = [
  { label: "Dashboard",  section: "General",  icon: "grid"     },
  { label: "Optimizer",  section: null,        icon: "bolt"     },
  { label: "FiveM",      section: "Library",   icon: "fivem"    },
  { label: "CallOfDuty", section: null,        icon: "cod"      },
  { label: "Power",      section: null,        icon: "power"    },
  { label: "Nvidia",     section: null,        icon: "nvidia"   },
  { label: "Games",      section: null,        icon: "circle"   },
  { label: "History",    section: null,        icon: "clock"    },
  { label: "Settings",   section: "System",    icon: "settings" },
];

function Icon({ name, size = 14 }) {
  const s = size;
  const icons = {
    grid:     <svg width={s} height={s} viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor"/><rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor" opacity="0.5"/><rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor" opacity="0.5"/><rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor" opacity="0.25"/></svg>,
    bolt:     <svg width={s} height={s} viewBox="0 0 14 14" fill="none"><path d="M8 1L3 8h4l-1 5 6-7H8L8 1z" fill="currentColor"/></svg>,
    circle:   <svg width={s} height={s} viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/><circle cx="7" cy="7" r="2" fill="currentColor"/></svg>,
    clock:    <svg width={s} height={s} viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="M7 4v3l2 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    settings: <svg width={s} height={s} viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2" fill="currentColor"/><path d="M7 1v2M7 11v2M1 7h2M11 7h2M3 3l1.4 1.4M9.6 9.6L11 11M3 11l1.4-1.4M9.6 4.4L11 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    fivem:    <svg width={s} height={s} viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M4 4h6M4 7h4M4 10h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
    cod:      <svg width={s} height={s} viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    nvidia:   <svg width={s} height={s} viewBox="0 0 14 14" fill="none"><path d="M2 4.5C2 3.1 3.1 2 4.5 2H7v2H4.5a.5.5 0 0 0-.5.5v5a.5.5 0 0 0 .5.5H7v2H4.5C3.1 12 2 10.9 2 9.5v-5z" fill="currentColor" opacity="0.5"/><path d="M7 2h2.5C10.9 2 12 3.1 12 4.5v5C12 10.9 10.9 12 9.5 12H7v-2h2.5a.5.5 0 0 0 .5-.5v-5a.5.5 0 0 0-.5-.5H7V2z" fill="currentColor"/></svg>,
    power:    <svg width={s} height={s} viewBox="0 0 14 14" fill="none"><path d="M7 1v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M4.5 3C2.8 3.8 2 5.3 2 7a5 5 0 0 0 10 0c0-1.7-.8-3.2-2.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>,
  };
  return icons[name] || null;
}

function formatExpiry(expiresAt) {
  if (!expiresAt) return "Lifetime license";
  const date = new Date(expiresAt);
  const now = new Date();
  const daysLeft = Math.ceil((date - now) / 86400000);
  if (daysLeft <= 0) return "Expired";
  if (daysLeft === 1) return "Expires tomorrow";
  if (daysLeft <= 7) return `${daysLeft} days remaining`;
  return `Expires ${date.toLocaleDateString()}`;
}

export default function Dashboard() {
  const [active, setActive] = useState("Dashboard");
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const licenseInfo = getLicenseExpiry() || (() => {
    try { return JSON.parse(localStorage.getItem("framely_license") || "null"); } catch { return null; }
  })();
  let section = null;

  useEffect(() => {
    (async () => {
      try {
        const update = await check();
        if (update?.available) {
          const confirmed = window.confirm(
            `Framely ${update.version} is available!\n\nInstall now?`
          );
          if (confirmed) {
            await update.downloadAndInstall();
            await relaunch();
          }
        }
      } catch (e) {
        console.error("Update check failed:", e);
      }
    })();
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg0, color: C.text, fontFamily: C.fontUI }}>
      <TitleBar />
      <ToastContainer />
      {showDeactivateModal && (
        <DeactivateModal
          onClose={() => setShowDeactivateModal(false)}
          onConfirm={async () => { await clearLicense(); window.location.reload(); }}
        />
      )}

      <aside style={{
        width: 210, background: C.bg0, borderRight: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column", paddingTop: 36, flexShrink: 0,
      }}>
        <div style={{
          padding: "16px 18px 14px", display: "flex", alignItems: "center", gap: 10,
          borderBottom: `1px solid ${C.border}`, marginBottom: 8,
        }}>
          <FramelyLogo size={26} />
          <span style={{ fontSize: 15, fontWeight: 700, color: C.gold, letterSpacing: "0.2em", textTransform: "uppercase", fontFamily: C.fontUI }}>Framely</span>
        </div>

        <nav style={{ flex: 1 }}>
          {NAV.map(({ label, section: sec, icon }) => {
            const showSection = sec && sec !== section;
            if (showSection) section = sec;
            const isActive = active === label;
            return (
              <div key={label}>
                {showSection && (
                  <div style={{ padding: "14px 18px 5px", fontSize: 9, color: C.textDim, letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: C.fontUI, fontWeight: 600 }}>{sec}</div>
                )}
                <button
                  onClick={() => setActive(label)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 18px", width: "100%", border: "none",
                    background: isActive ? C.bg2 : "transparent",
                    borderLeft: `2px solid ${isActive ? C.gold : "transparent"}`,
                    color: isActive ? C.gold : C.textMid,
                    fontSize: 13, cursor: "pointer", textAlign: "left",
                    fontFamily: C.fontUI, fontWeight: isActive ? 700 : 500,
                    letterSpacing: "0.08em", transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color = C.text; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; } }}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = C.textMid; e.currentTarget.style.background = "transparent"; } }}
                >
                  <Icon name={icon} />
                  {label}
                </button>
              </div>
            );
          })}
        </nav>

<div style={{ padding: "14px 18px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.gold, boxShadow: `0 0 6px ${C.gold}`, animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 10, color: C.gold, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>License Active</span>
          </div>
          <div style={{ fontSize: 11, color: C.textMid, marginBottom: 12, paddingLeft: 12, letterSpacing: "0.04em" }}>
            {licenseInfo ? formatExpiry(licenseInfo.expiresAt) : "—"}
          </div>
          <button
            onClick={() => setShowDeactivateModal(true)}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#c05050"; e.currentTarget.style.color = "#e07070"; e.currentTarget.style.background = "#1a0808"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textDim; e.currentTarget.style.background = "transparent"; }}
            style={{
              width: "100%", padding: "7px 0", borderRadius: 6,
              border: `1px solid ${C.border}`, background: "transparent",
              color: C.textDim, fontSize: 11, cursor: "pointer",
              letterSpacing: "0.1em", textTransform: "uppercase",
              fontWeight: 600, fontFamily: C.fontUI,
              transition: "all 0.2s",
            }}
          >
            Deactivate
          </button>
          <div style={{ fontSize: 9, color: C.textDim, textAlign: "center", marginTop: 10, letterSpacing: "0.1em", fontFamily: C.fontMono }}>v1.0.6</div>
        </div>
        <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
      </aside>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", paddingTop: 36 }}>
        <header style={{ padding: "14px 28px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: C.text, letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: C.fontUI }}>{active}</span>
          <SystemStatusBadge />
        </header>
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          {active === "Dashboard"  && <DashboardPage />}
          {active === "Optimizer"  && <OptimizerPage />}
          {active === "FiveM"      && <FiveMPage />}
          {active === "CallOfDuty" && <CallOfDutyPage />}
          {active === "Power"      && <PowerPage />}
          {active === "Nvidia"     && <NvidiaPage />}
          {active === "Games"      && <GamesPage />}
          {active === "History"    && <HistoryPage />}
          {active === "Settings"   && <SettingsPage />}
        </div>
      </main>
    </div>
  );
}

// ─── Singleton system info poller ─────────────────────────────────────────────
const _sysListeners = new Set();
let _sysCache = null;
let _sysTimer = null;

function sysInfoSubscribe(fn) {
  _sysListeners.add(fn);
  if (_sysCache) fn(_sysCache);
  if (!_sysTimer) {
    const poll = async () => {
      try {
        const d = await invoke("get_system_info");
        _sysCache = d;
        _sysListeners.forEach(f => f(d));
      } catch {}
    };
    poll();
    _sysTimer = setInterval(poll, 6000);
  }
  return () => {
    _sysListeners.delete(fn);
    if (_sysListeners.size === 0) { clearInterval(_sysTimer); _sysTimer = null; }
  };
}

function useSystemInfo() {
  const [info, setInfo] = useState(_sysCache);
  useEffect(() => sysInfoSubscribe(setInfo), []);
  return info;
}

function SystemStatusBadge() {
  const info = useSystemInfo();
  const cpuUsage = info ? Math.round(info.cpu_usage) : null;
  const cpuColor = cpuUsage > 80 ? "#e07070" : cpuUsage > 50 ? "#c8973a" : C.gold;

  return (
    <div style={{
      fontSize: 11, padding: "5px 14px", borderRadius: 20, background: C.bg2,
      border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8,
      letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: C.fontUI, fontWeight: 600,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: cpuColor, transition: "background 0.5s" }} />
      {info ? (
        <>
          <span style={{ color: cpuColor, transition: "color 0.5s" }}>CPU {cpuUsage}%</span>
          <span style={{ color: C.border }}>·</span>
          <span style={{ color: C.textMid }}>RAM {info.used_memory_gb}<span style={{ color: C.textDim }}>/{info.total_memory_gb} GB</span></span>
        </>
      ) : <span style={{ color: C.textDim }}>System ready</span>}
    </div>
  );
}

// ─── Shared card/button styles ─────────────────────────────────────────────
const card = {
  background: "#0d0d0d",
  border: "1px solid #2a2318",
  borderTop: "1px solid #3a3226",
  borderRadius: 10,
  padding: "20px 22px",
  marginBottom: 14,
};
const cardTitle = {
  fontSize: 10, fontWeight: 700, color: "#7a6a38",
  marginBottom: 18, letterSpacing: "0.24em",
  textTransform: "uppercase", fontFamily: "'Rajdhani', system-ui, sans-serif",
};

function Empty({ message }) {
  return <div style={{ textAlign: "center", padding: "40px 0", color: C.textDim, fontSize: 13, letterSpacing: "0.06em" }}>{message}</div>;
}

// ─── Primary action button ────────────────────────────────────────────────
function Btn({ children, primary, danger, onClick, disabled }) {
  const base = {
    padding: "9px 20px", borderRadius: 7, fontSize: 13, cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700, fontFamily: C.fontUI, letterSpacing: "0.12em", textTransform: "uppercase",
    transition: "all 0.18s", opacity: disabled ? 0.45 : 1, outline: "none",
  };
  const styles = primary
    ? { ...base, border: "none", background: C.gold, color: "#080808", boxShadow: `0 0 0 0 ${C.gold}` }
    : danger
    ? { ...base, border: "1px solid #c05050", background: "#2a1010", color: "#e07070" }
    : { ...base, border: `1px solid ${C.border}`, background: "transparent", color: C.textMid };

  return (
    <button onClick={onClick} disabled={disabled} style={styles}
      onMouseEnter={e => {
        if (disabled) return;
        if (primary) { e.currentTarget.style.background = "#e8c040"; e.currentTarget.style.boxShadow = `0 4px 18px rgba(212,170,60,0.3)`; }
        else if (danger) { e.currentTarget.style.background = "#3a1515"; }
        else { e.currentTarget.style.borderColor = C.goldDim; e.currentTarget.style.color = C.text; }
      }}
      onMouseLeave={e => {
        if (disabled) return;
        if (primary) { e.currentTarget.style.background = C.gold; e.currentTarget.style.boxShadow = "0 0 0 0 transparent"; }
        else if (danger) { e.currentTarget.style.background = "#2a1010"; }
        else { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMid; }
      }}
    >{children}</button>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────
function StatCard({ label, value, accent }) {
  return (
    <div style={{
      background: "#0d0d0d", border: `1px solid ${accent ? C.goldDim : "#2a2318"}`,
      borderTop: `2px solid ${accent ? C.gold : "#3a3226"}`,
      borderRadius: 10, padding: "16px 18px",
    }}>
      <div style={{ fontSize: 10, color: C.textDim, marginBottom: 10, letterSpacing: "0.14em", fontFamily: C.fontUI, fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent ? C.gold : C.text, fontFamily: C.fontUI, letterSpacing: "0.04em", lineHeight: 1 }}>{value}</div>
    </div>
  );
}

// ─── Dashboard page ────────────────────────────────────────────────────────
function DashboardPage() {
  const info = useSystemInfo();
  const [killing, setKilling] = useState(false);
  const [killed, setKilled] = useState(null);

  async function handleBoost() {
    setKilling(true); setKilled(null);
    try {
      const result = await invoke("kill_background_processes");
      setKilled(result);
      historyAdd("Boost — Kill background processes", `Killed: ${result.join(", ") || "none"}`, true);
      showToast(`Boosted — ${result.length} process${result.length !== 1 ? "es" : ""} killed`);
    } catch(e) {
      setKilled([]);
      historyAdd("Boost — Kill background processes", String(e), false);
      showToast("Boost failed", "error");
    }
    setKilling(false);
  }

  const cpuVal = info ? `${Math.round(info.cpu_usage)}%` : "—";
  const cpuHigh = info && info.cpu_usage > 70;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
        <StatCard label="CPU Usage"  value={cpuVal} accent={cpuHigh} />
        <StatCard label="RAM Used"   value={info ? `${info.used_memory_gb} GB` : "—"} />
        <StatCard label="Total RAM"  value={info ? `${info.total_memory_gb} GB` : "—"} />
        <StatCard label="OS"         value={info ? (info.os || "Unknown").split(" ").slice(0, 2).join(" ") : "—"} />
      </div>
      <div style={card}>
        <div style={cardTitle}>Quick actions</div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn primary onClick={handleBoost} disabled={killing}>{killing ? "Boosting..." : "⚡ Boost now"}</Btn>
          <Btn onClick={() => { _sysCache = null; invoke("get_system_info").then(d => { _sysCache = d; _sysListeners.forEach(f => f(d)); }).catch(() => {}); }}>Refresh stats</Btn>
        </div>
      </div>
      {killed !== null ? (
        <div style={card}>
          <div style={cardTitle}>Boost result</div>
          {killed.length === 0 ? (
            <p style={{ fontSize: 13, color: C.textMid, margin: 0, letterSpacing: "0.04em" }}>No target processes were running — you're already clean.</p>
          ) : (
            <div>
              <p style={{ fontSize: 12, color: C.textMid, marginBottom: 12, letterSpacing: "0.04em" }}>Killed <strong style={{ color: C.gold }}>{killed.length}</strong> process{killed.length !== 1 ? "es" : ""}:</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {killed.map(p => (
                  <span key={p} style={{ fontSize: 11, padding: "4px 12px", borderRadius: 5, background: C.bg3, border: `1px solid ${C.border}`, color: C.gold, fontFamily: C.fontMono }}>{p}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={card}>
          <div style={cardTitle}>Recent activity</div>
          <Empty message="No activity yet. Run a boost to get started." />
        </div>
      )}
    </div>
  );
}

// ─── Optimizer page ────────────────────────────────────────────────────────
function OptimizerPage() {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [killed, setKilled] = useState(null);
  const [phase, setPhase] = useState("");
  const sysInfo = useSystemInfo();

  async function startScan() {
    setScanning(true); setProgress(0); setKilled(null);
    setPhase("Reading system info...");
    await new Promise(r => setTimeout(r, 300));
    setProgress(40);
    setPhase("Killing background processes...");
    try {
      const result = await invoke("kill_background_processes");
      setKilled(result);
      historyAdd("Optimizer scan — Kill processes", `Killed: ${result.join(", ") || "none"}`, true);
    } catch { setKilled([]); }
    setProgress(80);
    setPhase("Finalizing settings...");
    await new Promise(r => setTimeout(r, 600));
    setProgress(100); setPhase("Complete");
    setScanning(false);
    showToast("Optimization complete");
  }

  return (
    <div>
      <div style={card}>
        <div style={cardTitle}>System optimizer</div>
        <p style={{ fontSize: 14, color: C.textMid, marginBottom: 20, lineHeight: 1.7, fontFamily: C.fontUI, fontWeight: 500 }}>
          Scans your PC and applies optimal settings for maximum gaming performance.
        </p>
        {scanning ? (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: C.textMid, letterSpacing: "0.08em" }}>{phase}</span>
              <span style={{ fontSize: 11, color: C.gold, fontWeight: 700 }}>{progress}%</span>
            </div>
            <div style={{ height: 3, background: C.bg3, borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${progress}%`, background: `linear-gradient(90deg, ${C.goldDim}, ${C.gold})`, borderRadius: 2, transition: "width 0.4s ease" }} />
            </div>
          </div>
        ) : <Btn primary onClick={startScan}>{progress === 100 ? "Run again" : "Start scan"}</Btn>}
      </div>
      {progress === 100 && sysInfo && (
        <div style={card}>
          <div style={cardTitle}>System snapshot</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["CPU", sysInfo.cpu_name], ["CPU Load", `${Math.round(sysInfo.cpu_usage)}%`], ["RAM", `${sysInfo.used_memory_gb} / ${sysInfo.total_memory_gb} GB`], ["OS", sysInfo.os]].map(([label, val]) => (
              <div key={label} style={{ background: C.bg2, borderRadius: 7, padding: "11px 15px", border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 9, color: C.textDim, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
                <div style={{ fontSize: 13, color: C.text, fontFamily: C.fontMono }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {progress === 100 && killed !== null && (
        <div style={card}>
          <div style={cardTitle}>Processes killed</div>
          {killed.length === 0
            ? <p style={{ fontSize: 13, color: C.textMid, margin: 0 }}>No target processes were running.</p>
            : <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{killed.map(p => <span key={p} style={{ fontSize: 11, padding: "4px 12px", borderRadius: 5, background: C.bg3, border: `1px solid ${C.border}`, color: C.gold, fontFamily: C.fontMono }}>{p}</span>)}</div>
          }
        </div>
      )}
      <div style={card}>
        <div style={cardTitle}>Optimization options</div>
        <ActionToggle storageKey="opt_killbg"   label="Kill non-essential background processes"   description="Force-closes OneDrive, Teams, Slack, and other background apps to free up RAM and CPU for your game."                                                        onEnable={() => invoke("kill_background_processes")} onDisable={null} />
        <ActionToggle storageKey="opt_cpuprio"  label="Set CPU priority to high for games"         description="Raises the CPU scheduling priority of detected game processes so Windows gives them more processor time over background tasks."                              onEnable={() => invoke("set_cpu_priority", { enable: true })} onDisable={() => invoke("set_cpu_priority", { enable: false })} />
        <ActionToggle storageKey="opt_flushdns" label="Flush DNS cache before session"             description="Clears your DNS resolver cache so domain lookups go fresh to your DNS server. Fixes stale server addresses and reduces connection hitches on join."         onEnable={() => invoke("flush_dns_cache", { enable: true })} onDisable={null} />
        <ActionToggle storageKey="opt_gamebar"  label="Disable Windows Game Bar"                   description="Turns off the Xbox Game Bar overlay. Eliminates background input hooks and DVR recording overhead that can cause micro-stutters and FPS drops."             onEnable={() => invoke("set_game_bar", { enable: false })} onDisable={() => invoke("set_game_bar", { enable: true })} />
        <ActionToggle storageKey="opt_gpusched" label="Enable hardware-accelerated GPU scheduling" description="Moves GPU memory scheduling from the CPU to the GPU itself. Reduces CPU overhead and can lower frame latency, especially on newer GPUs and drivers."        onEnable={() => invoke("set_gpu_scheduling", { enable: true })} onDisable={() => invoke("set_gpu_scheduling", { enable: false })} />
        <ActionToggle storageKey="opt_devpower" label="Disable power saving for all devices"       description="Prevents Windows from powering down your NIC, audio, USB, and PCIe devices to save power. Eliminates random device wake-up delays during gameplay."        onEnable={() => invoke("disable_device_power_saving", { enable: true })} onDisable={() => invoke("disable_device_power_saving", { enable: false })} />
        <ActionToggle storageKey="opt_usbpower" label="Disable USB root hub power saving"          description="Stops Windows from suspending USB root hubs. Prevents mouse, keyboard, and headset dropouts caused by the USB controller going into a low-power state."    onEnable={() => invoke("disable_usb_power_saving", { enable: true })} onDisable={() => invoke("disable_usb_power_saving", { enable: false })} />
      </div>
    </div>
  );
}

// ─── Nvidia page ────────────────────────────────────────────────────────────
function NvidiaPage() {
  const [status, setStatus] = useState({});
  const [msg, setMsg] = useState({});

  async function run(key, fn, label) {
    setStatus(s => ({ ...s, [key]: "loading" }));
    setMsg(m => ({ ...m, [key]: "" }));
    try {
      const result = await fn();
      setStatus(s => ({ ...s, [key]: "ok" }));
      setMsg(m => ({ ...m, [key]: result }));
      showToast(label || "Applied successfully");
    } catch(e) {
      setStatus(s => ({ ...s, [key]: "err" }));
      setMsg(m => ({ ...m, [key]: String(e) }));
      showToast(String(e), "error");
    }
    setTimeout(() => setStatus(s => ({ ...s, [key]: "idle" })), 4000);
  }

  function StatusMsg({ k }) {
    const s = status[k]; const m = msg[k];
    if (!s || s === "idle") return null;
    return <div style={{ marginTop: 8, fontSize: 11, letterSpacing: "0.06em", color: s === "err" ? "#c05050" : s === "loading" ? C.textDim : C.gold, fontFamily: C.fontMono }}>{s === "loading" ? "Applying..." : m}</div>;
  }

  return (
    <div>
      <div style={card}>
        <div style={cardTitle}>Prerequisites</div>
        <p style={{ fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.7 }}>Allow PowerShell scripts to run before applying any preset. Only needs to be done once.</p>
        <Btn primary onClick={() => run("scripts", () => invoke("nvidia_allow_scripts"), "Scripts enabled")}>{status["scripts"] === "loading" ? "Enabling..." : "Enable PowerShell Scripts"}</Btn>
        <StatusMsg k="scripts" />
      </div>
      {[["K", "Best suited for 20 & 30 series GPUs. Recommended starting point for most users."], ["M", "Best suited for 40 & 50 series GPUs with performance mode 5 enabled."]].map(([preset, desc]) => (
        <div key={preset} style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: C.fontUI }}>Preset {preset}</div>
            <span style={{ fontSize: 9, padding: "3px 10px", borderRadius: 10, background: C.bg3, color: C.goldDim, letterSpacing: "0.1em", border: `1px solid ${C.border}` }}>REBAR OFF</span>
          </div>
          <p style={{ fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.7 }}>{desc}</p>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn primary onClick={() => run(`preset${preset}`, () => invoke("nvidia_apply_preset", { preset }), `Preset ${preset} applied`)}>{status[`preset${preset}`] === "loading" ? "Applying..." : `Apply Preset ${preset}`}</Btn>
            <Btn onClick={() => run(`preset${preset}reset`, () => invoke("nvidia_reset_profile"), "Reset to default")}>Reset to Default</Btn>
          </div>
          <StatusMsg k={`preset${preset}`} />
          <StatusMsg k={`preset${preset}reset`} />
        </div>
      ))}
    </div>
  );
}

// ─── Power page ────────────────────────────────────────────────────────────
const POWER_PLANS = [
  { id: "core",           name: "Core",           desc: "Framely's custom plan tuned for low latency gaming." },
  { id: "adamx",          name: "AdamX",          desc: "High performance plan by AdamX." },
  { id: "ancel",          name: "Ancel",           desc: "Lightweight performance plan by Ancel." },
  { id: "atlas",          name: "Atlas",           desc: "Balanced performance plan by Atlas." },
  { id: "bitsum",         name: "Bitsum",          desc: "Bitsum Highest Performance plan." },
  { id: "calypto",        name: "Calypto",         desc: "Calypto optimized power plan." },
  { id: "exmfree",        name: "EXM Free",        desc: "EXM free tier performance plan." },
  { id: "FrameSyncBoost", name: "FrameSync Boost", desc: "Frame timing and sync optimized plan." },
  { id: "hybred",         name: "Hybred",          desc: "Hybrid performance and efficiency plan." },
  { id: "kaisen",         name: "Kaisen",          desc: "Kaisen tuned performance plan." },
  { id: "khorvie",        name: "Khorvie",         desc: "Khorvie high performance plan." },
  { id: "kirby",          name: "Kirby",           desc: "Kirby optimized power plan." },
  { id: "kizzimo",        name: "Kizzimo",         desc: "Kizzimo performance plan." },
  { id: "lawliet",        name: "Lawliet",         desc: "Lawliet tuned power plan." },
  { id: "nexus",          name: "Nexus",           desc: "Nexus performance power plan." },
  { id: "powerx",         name: "PowerX",          desc: "PowerX high performance plan." },
  { id: "sapphire",       name: "Sapphire",        desc: "Sapphire optimized power plan." },
  { id: "vtrl",           name: "VTRL",            desc: "VTRL performance plan." },
  { id: "xilly",          name: "Xilly",           desc: "Xilly tuned power plan." },
  { id: "xos",            name: "XOS",             desc: "XOS performance power plan." },
];

function PowerPage() {
  const [activePlan, setActivePlan] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("ok");

  useEffect(() => { invoke("get_active_power_plan").then(setActivePlan).catch(() => {}); }, []);

  async function activatePlan(planId, planName) {
    setLoadingPlan(planId); setMsg("");
    try {
      const result = await invoke("activate_power_plan", { plan: planId });
      setMsg(result); setMsgType("ok");
      const updated = await invoke("get_active_power_plan");
      setActivePlan(updated);
      showToast(`${planName} activated`);
    } catch(e) {
      setMsg(String(e)); setMsgType("err");
      showToast(String(e), "error");
    }
    setLoadingPlan(null);
    setTimeout(() => setMsg(""), 4000);
  }

  async function restoreDefault() {
    setLoadingPlan("default"); setMsg("");
    try {
      const result = await invoke("restore_default_power_plan");
      setMsg(result); setMsgType("ok");
      const updated = await invoke("get_active_power_plan");
      setActivePlan(updated);
      showToast("Restored Windows default plan");
    } catch(e) {
      setMsg(String(e)); setMsgType("err");
      showToast(String(e), "error");
    }
    setLoadingPlan(null);
    setTimeout(() => setMsg(""), 4000);
  }

  return (
    <div>
      <div style={card}>
        <div style={cardTitle}>Active power plan</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.gold, fontFamily: C.fontUI, letterSpacing: "0.08em", marginBottom: 4 }}>
          {activePlan || "Loading..."}
        </div>
        <div style={{ fontSize: 12, color: C.textDim, letterSpacing: "0.06em" }}>
          {activePlan ? "Framely custom plan active" : "Detecting..."}
        </div>
      </div>
      <div style={card}>
        <div style={cardTitle}>Select plan</div>
        <p style={{ fontSize: 13, color: C.textMid, marginBottom: 18, lineHeight: 1.7 }}>
          Choose from 20 performance power plans. Each is imported and activated via <code>powercfg</code>.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {POWER_PLANS.map(({ id, name, desc }) => {
            const isActive = activePlan?.toLowerCase().includes(name.toLowerCase());
            const isLoading = loadingPlan === id;
            return (
              <div key={id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
                padding: "12px 14px", borderRadius: 8,
                border: `1px solid ${isActive ? C.gold : C.border}`,
                background: isActive ? C.bg2 : "transparent",
                borderLeft: `3px solid ${isActive ? C.gold : C.border}`,
                transition: "all 0.15s",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? C.gold : C.text, fontFamily: C.fontUI, letterSpacing: "0.06em" }}>{name}</span>
                    {isActive && <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 8, background: C.gold, color: "#080808", letterSpacing: "0.12em", fontWeight: 700 }}>ACTIVE</span>}
                  </div>
                  <div style={{ fontSize: 11, color: C.textDim, letterSpacing: "0.04em" }}>{desc}</div>
                </div>
                <Btn
                  primary={!isActive}
                  onClick={() => activatePlan(id, name)}
                  disabled={isActive || isLoading || loadingPlan !== null}
                >
                  {isLoading ? "Applying..." : isActive ? "Active" : "Activate"}
                </Btn>
              </div>
            );
          })}
        </div>
        {msg && (
          <div style={{ marginTop: 14, fontSize: 11, color: msgType === "err" ? "#c05050" : C.gold, letterSpacing: "0.06em" }}>{msg}</div>
        )}
      </div>
      <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, color: C.textMid, fontFamily: C.fontUI }}>Restore Windows default</div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>Switches back to the Windows Balanced plan</div>
        </div>
        <Btn onClick={restoreDefault} disabled={loadingPlan !== null}>
          {loadingPlan === "default" ? "Restoring..." : "Restore default"}
        </Btn>
      </div>
      <div style={card}>
        <div style={cardTitle}>Plan details</div>
        {[["CPU policy", "Always run at max frequency"], ["Sleep states", "Disabled"], ["Hard disk timeout", "Never"], ["USB selective", "Disabled"], ["PCI Express", "Max performance"]].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
            <span style={{ color: C.textMid, fontFamily: C.fontUI }}>{k}</span>
            <span style={{ color: C.gold, fontFamily: C.fontMono, fontSize: 11, padding: "2px 10px", background: C.bg3, borderRadius: 4, border: `1px solid ${C.border}` }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── FiveM page ────────────────────────────────────────────────────────────
function FiveMPage() {
  return (
    <div>
      <div style={card}>
        <div style={cardTitle}>FiveM Optimization Suite</div>
        <p style={{ fontSize: 13, color: C.textMid, marginBottom: 0, lineHeight: 1.7, fontFamily: C.fontUI, fontWeight: 500 }}>
          Apply network, TCP, and keyboard tweaks tailored for FiveM servers.
        </p>
      </div>
      <div style={card}>
        <div style={cardTitle}>Network Registry</div>
        <ActionToggle storageKey="fm_dns"       label="Optimize DNS & service provider priority"                       description="Reorders Windows name resolution so DNS lookups happen first and fastest. Reduces the time it takes to resolve FiveM server addresses on connect."                                              onEnable={() => invoke("fivem_dns_priority", { enable: true })} onDisable={() => invoke("fivem_dns_priority", { enable: false })} />
        <ActionToggle storageKey="fm_ipv6"      label="Disable IPv6 (reduces latency on IPv4 servers)"                 description="Disables the IPv6 network stack so Windows stops attempting IPv6 routes to IPv4-only FiveM servers. Eliminates fallback delays and forces a direct IPv4 path."                              onEnable={() => invoke("fivem_disable_ipv6", { enable: true })} onDisable={() => invoke("fivem_disable_ipv6", { enable: false })} />
        <ActionToggle storageKey="fm_qos"       label="Remove bandwidth throttle (QoS NonBestEffortLimit = 0)"         description="By default Windows reserves up to 20% of your bandwidth for QoS traffic. Setting this to 0 gives 100% of your connection to your game."                                                    onEnable={() => invoke("fivem_qos_limit", { enable: true })} onDisable={() => invoke("fivem_qos_limit", { enable: false })} />
        <ActionToggle storageKey="fm_maxconn"   label="Boost max connections per server"                               description="Raises the maximum simultaneous HTTP connections Windows allows per server from 10 to 22. Speeds up asset streaming and resource downloads when joining a server."                          onEnable={() => invoke("fivem_max_connections", { enable: true })} onDisable={() => invoke("fivem_max_connections", { enable: false })} />
        <ActionToggle storageKey="fm_ports"     label="Increase max user ports & reduce TIME_WAIT delay"               description="Expands the available outbound port range and reduces how long closed connections linger. Prevents port exhaustion on high-pop servers and speeds up reconnects."                           onEnable={() => invoke("fivem_port_tuning", { enable: true })} onDisable={() => invoke("fivem_port_tuning", { enable: false })} />
        <ActionToggle storageKey="fm_mmprofile" label="Multimedia network throttling & system responsiveness"           description="Tells Windows not to throttle network activity during media playback and boosts system timer resolution. Lowers latency spikes when audio or video is running alongside your game."     onEnable={() => invoke("fivem_multimedia_profile", { enable: true })} onDisable={() => invoke("fivem_multimedia_profile", { enable: false })} />
      </div>
      <div style={card}>
        <div style={cardTitle}>TCP Tweaks</div>
        <ActionToggle storageKey="fm_nagle"     label="Disable Nagle's algorithm (lower latency, higher CPU)"   description="Nagle's algorithm batches small packets together to save bandwidth. Disabling it sends packets immediately, reducing ping at the cost of slightly more CPU usage."                        onEnable={() => invoke("fivem_nagle", { enable: true })} onDisable={() => invoke("fivem_nagle", { enable: false })} />
        <ActionToggle storageKey="fm_tcpwin"    label="TCP window size & retransmission tuning"                 description="Increases the TCP receive window so more data can be in-flight at once, and tunes retransmission timing. Improves throughput and reduces stutter on high-latency connections."         onEnable={() => invoke("fivem_tcp_window", { enable: true })} onDisable={() => invoke("fivem_tcp_window", { enable: false })} />
        <ActionToggle storageKey="fm_winsock"   label="Winsock TCP stack optimization (netsh)"                  description="Applies low-level TCP stack tweaks via netsh — disables auto-tuning heuristics and sets optimal buffer behaviour. One-way tweak; a Winsock reset restores defaults."                  onEnable={() => invoke("fivem_winsock", { enable: true })} onDisable={null} />
      </div>
      <div style={card}>
        <div style={cardTitle}>Keyboard Response</div>
        <ActionToggle storageKey="fm_kbd"       label="Reduce keyboard repeat delay & bounce time"                     description="Lowers the initial key repeat delay and debounce interval in the registry. Makes keyboard input feel snappier and more responsive in-game."                                             onEnable={() => invoke("fivem_keyboard", { enable: true })} onDisable={() => invoke("fivem_keyboard", { enable: false })} />
        <ActionToggle storageKey="fm_kbdqueue"  label="Keyboard driver queue size (kbdclass — restart required)"       description="Increases the kbdclass driver's internal input buffer. Prevents dropped keystrokes under high CPU load. Requires a restart to take effect."                                            onEnable={() => invoke("fivem_keyboard_queue", { enable: true })} onDisable={() => invoke("fivem_keyboard_queue", { enable: false })} />
      </div>
      <div style={card}>
        <div style={cardTitle}>Mouse</div>
        <ActionToggle storageKey="fm_mouseaccel" label="Disable mouse acceleration (1:1 linear movement)" description="Removes Windows pointer precision (mouse acceleration) so your crosshair moves exactly as far as your physical mouse moves, regardless of speed. Essential for consistent aim." onEnable={() => invoke("fivem_mouse_accel", { enable: true })} onDisable={() => invoke("fivem_mouse_accel", { enable: false })} />
      </div>
      <div style={card}>
        <div style={cardTitle}>Advanced Network</div>
        <ActionToggle storageKey="fm_afd"       label="AFD socket buffer tuning (1 MB send/receive windows)"                          description="Sets the Ancillary Function Driver send and receive socket buffers to 1 MB each. Reduces network stalls when the game bursts large amounts of data to the server."              onEnable={() => invoke("fivem_afd_buffers", { enable: true })} onDisable={() => invoke("fivem_afd_buffers", { enable: false })} />
        <ActionToggle storageKey="fm_mmfull"    label="Full multimedia profile (NoLazyMode, AlwaysOn, Games task priority)"           description="Applies the complete multimedia system profile: forces the scheduler into always-on mode, disables lazy network throttling, and bumps the Games task category to highest system priority."  onEnable={() => invoke("fivem_multimedia_profile_full", { enable: true })} onDisable={() => invoke("fivem_multimedia_profile_full", { enable: false })} />
      </div>
      <div style={card}>
        <div style={cardTitle}>Apply All</div>
        <p style={{ fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.7 }}>Apply every FiveM optimization above in one click.</p>
        <FiveMApplyAll />
      </div>
    </div>
  );
}

function FiveMApplyAll() {
  const [status, setStatus] = useState("idle");
  const [log, setLog] = useState([]);

  async function applyAll() {
    setStatus("running"); setLog([]);
    const steps = [
      ["DNS priority",          () => invoke("fivem_dns_priority",              { enable: true })],
      ["Disable IPv6",          () => invoke("fivem_disable_ipv6",              { enable: true })],
      ["QoS limit",             () => invoke("fivem_qos_limit",                 { enable: true })],
      ["Max connections",       () => invoke("fivem_max_connections",           { enable: true })],
      ["Port tuning",           () => invoke("fivem_port_tuning",               { enable: true })],
      ["Multimedia profile",    () => invoke("fivem_multimedia_profile",        { enable: true })],
      ["Disable Nagle",         () => invoke("fivem_nagle",                     { enable: true })],
      ["TCP window",            () => invoke("fivem_tcp_window",                { enable: true })],
      ["Winsock TCP",           () => invoke("fivem_winsock",                   { enable: true })],
      ["Keyboard response",     () => invoke("fivem_keyboard",                  { enable: true })],
      ["Keyboard queue",        () => invoke("fivem_keyboard_queue",            { enable: true })],
      ["Mouse acceleration",    () => invoke("fivem_mouse_accel",               { enable: true })],
      ["AFD socket buffers",    () => invoke("fivem_afd_buffers",               { enable: true })],
      ["Full multimedia",       () => invoke("fivem_multimedia_profile_full",   { enable: true })],
    ];

    const fmKeys = ["fm_dns","fm_ipv6","fm_qos","fm_maxconn","fm_ports","fm_mmprofile","fm_nagle","fm_tcpwin","fm_winsock","fm_kbd","fm_kbdqueue","fm_mouseaccel","fm_afd","fm_mmfull"];
    fmKeys.forEach(k => sessionStorage.setItem(`toggle_${k}`, "true"));

    const results = [];
    for (const [label, fn] of steps) {
      try {
        await fn();
        results.push({ label, ok: true });
        historyAdd(`FiveM: ${label}`, "Applied", true);
      } catch(e) {
        results.push({ label, ok: false, err: String(e) });
        historyAdd(`FiveM: ${label}`, String(e), false);
      }
      setLog([...results]);
    }
    setStatus("done");
    showToast("All FiveM tweaks applied");
  }

  const doneCount = log.filter(l => l.ok).length;
  const failCount = log.filter(l => !l.ok).length;

  return (
    <div>
      <Btn primary onClick={applyAll} disabled={status === "running"}>
        {status === "running" ? `Applying... (${log.length}/14)` : status === "done" ? "Apply again" : "⚡ Apply all FiveM tweaks"}
      </Btn>
      {status === "running" && log.length > 0 && (
        <div style={{ marginTop: 10, height: 3, background: C.bg3, borderRadius: 2 }}>
          <div style={{ height: "100%", width: `${(log.length / 14) * 100}%`, background: C.gold, borderRadius: 2, transition: "width 0.3s" }} />
        </div>
      )}
      {log.length > 0 && status === "done" && (
        <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 7, background: C.bg2, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.textMid, marginBottom: 10, letterSpacing: "0.06em" }}>
            <span style={{ color: C.gold }}>{doneCount} applied</span>
            {failCount > 0 && <> · <span style={{ color: "#e07070" }}>{failCount} failed</span></>}
          </div>
          {log.map(({ label, ok, err }) => (
            <div key={label} style={{ fontSize: 11, padding: "4px 0", color: ok ? C.gold : "#c05050", fontFamily: C.fontMono, borderBottom: `1px solid ${C.border}` }}>
              {ok ? "✓" : "✗"} {label}{err ? ` — ${err}` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Call of Duty page ────────────────────────────────────────────────────────
function CallOfDutyPage() {
  return (
    <div>
      <div style={card}>
        <div style={cardTitle}>Call of Duty Optimization Suite</div>
        <p style={{ fontSize: 13, color: C.textMid, marginBottom: 0, lineHeight: 1.7, fontFamily: C.fontUI, fontWeight: 500 }}>
          Engine, NTFS, and system tweaks tailored for Warzone, Black Ops 6, and Black Ops 7 (IW 9.0 engine).
        </p>
      </div>

      {/* ── Engine Config ─────────────────────────────────── */}
      <div style={card}>
        <div style={cardTitle}>Engine Config</div>
        <ActionToggle
          storageKey="cod_adv"
          label="Optimize adv_options.ini (RendererWorkerCount + VideoMemoryScale)"
          description="Writes optimized values to CoD's engine config — sets RendererWorkerCount to half your physical cores for better frame pacing, VideoMemoryScale to 0.55 to reduce VRAM pressure, and ConfigCloudStorageEnabled=0 so the cloud can't reset it. File is locked read-only after write."
          onEnable={() => invoke("cod_adv_options", { enable: true })}
          onDisable={() => invoke("cod_adv_options", { enable: false })}
        />
        <ActionToggle
          storageKey="cod_texstream"
          label="Remove texture stream bandwidth cap (fixes packet burst / BO6 / BO7)"
          description="Sets HTTPStreamLimitMBytes to 0 in CoD's config files — this is the #1 cause of the packet burst icon and mid-match stutter in BO6 and BO7. The default cap of 1024 MB chokes the texture streaming pipeline and CoD misreads it as network lag."
          onEnable={() => invoke("cod_config_texture_stream", { enable: true })}
          onDisable={() => invoke("cod_config_texture_stream", { enable: false })}
        />
        <ActionToggle
          storageKey="cod_gpuheaps"
          label="Disable GPU upload heaps (fixes ReBAR micro-stutters in BO6 / BO7 / Warzone)"
          description="Sets GPUUploadHeaps to false in CoD's config files. ReBAR VRAM overflow causes micro-stutters on both AMD and NVIDIA cards — this is a confirmed community fix for Warzone and BO6/BO7 micro-freeze issues. Applies to all detected CoD config files."
          onEnable={() => invoke("cod_gpu_upload_heaps", { enable: true })}
          onDisable={() => invoke("cod_gpu_upload_heaps", { enable: false })}
        />
      </div>

      {/* ── BO7 Shader & Config Tools ─────────────────────── */}
      <div style={card}>
        <div style={cardTitle}>Black Ops 7 — Shader & Config Tools</div>
        <ActionToggle
          storageKey="cod_shaderclear"
          label="Clear CoD shader cache (fixes stuck shaders & compile stutters)"
          description="Deletes CoD's compiled shader cache so the game recompiles shaders clean on next launch. Fixes the 'shaders stuck at 99%' bug and the micro-stutters caused by stale shader objects that affect BO7's IW 9.0 engine. Launch the game and wait for shaders to finish before joining a match."
          onEnable={() => invoke("cod_shader_cache_clear")}
          onDisable={null}
        />
        <ActionToggle
          storageKey="cod_nvcache"
          label="Clear NVIDIA shader cache for CoD (fixes post-driver-update stutter)"
          description="Clears NV_Cache and D3DSCache — stale compiled shaders left over after driver updates cause micro-stutters and frame drops in BO7 and Warzone. Forces a clean recompile on next launch. Allow the shader preloading screen to fully complete before queuing."
          onEnable={() => invoke("cod_clear_nvidia_cache")}
          onDisable={null}
        />
        <ActionToggle
          storageKey="cod_cfgreset"
          label="Reset CoD config folder (fixes sudden FPS drops mid-season)"
          description="Deletes the Documents\Call of Duty\players folder so CoD regenerates all settings fresh. Fixes sudden FPS drops that appear out of nowhere after patches — often caused by corrupted or stale config state. Note your graphics settings before applying as they will reset."
          onEnable={() => invoke("cod_config_reset")}
          onDisable={null}
        />
      </div>

      {/* ── System Tweaks ─────────────────────────────────── */}
      <div style={card}>
        <div style={cardTitle}>System Tweaks</div>
        <ActionToggle
          storageKey="cod_ntfs"
          label="Disable NTFS last-access update (reduces disk I/O during asset streaming)"
          description="Stops Windows from writing a timestamp every time CoD reads an asset file. Reduces disk I/O spikes during map loads and texture streaming, which cause hitches and stutter mid-game — especially noticeable in BO7's large Skirmish maps."
          onEnable={() => invoke("cod_ntfs_tweaks", { enable: true })}
          onDisable={() => invoke("cod_ntfs_tweaks", { enable: false })}
        />
        <ActionToggle
          storageKey="cod_fso"
          label="Disable fullscreen optimizations for CoD executables"
          description="Forces Windows to treat CoD as a true exclusive fullscreen application. Removes DWM compositing overhead and reduces input latency. Applies to ModernWarfare.exe, cod.exe, BlackOps6.exe, BlackOps7.exe, MW2.exe and MW3.exe."
          onEnable={() => invoke("cod_disable_fullscreen_optimizations", { enable: true })}
          onDisable={() => invoke("cod_disable_fullscreen_optimizations", { enable: false })}
        />
        <ActionToggle
          storageKey="cod_powerthrottle"
          label="Disable Windows power throttling (prevents worker thread CPU suppression)"
          description="Stops Windows from throttling background threads that CoD's render and physics workers can fall into under sustained load. Eliminates CPU power-state-related frame time spikes — particularly relevant on 12th+ gen Intel and Ryzen 7000 series which aggressively throttle efficiency cores."
          onEnable={() => invoke("cod_disable_power_throttling", { enable: true })}
          onDisable={() => invoke("cod_disable_power_throttling", { enable: false })}
        />
        <ActionToggle
          storageKey="cod_timercoalesce"
          label="Disable timer coalescing (reduces scheduling latency in game loops)"
          description="Prevents Windows from batching timer events together to save power. Allows CoD's high-frequency render and input loops to be serviced immediately rather than waiting for the next coalesced timer tick. Reduces the micro-delays that cause inconsistent frame pacing."
          onEnable={() => invoke("cod_disable_timer_coalescing", { enable: true })}
          onDisable={() => invoke("cod_disable_timer_coalescing", { enable: false })}
        />
        <ActionToggle
          storageKey="cod_memcache"
          label="Optimize memory manager for gaming (frees RAM from file cache)"
          description="Sets Windows memory manager to bias RAM toward running applications instead of file system caching. Also increases IoPageLockLimit so more physical pages can be locked for CoD's texture streaming pipeline — reduces the VRAM-overflow stutters that show as packet burst."
          onEnable={() => invoke("cod_large_system_cache", { enable: true })}
          onDisable={() => invoke("cod_large_system_cache", { enable: false })}
        />
        <ActionToggle
          storageKey="cod_tdr"
          label="Fix GPU TDR watchdog (eliminates black-screen recovery stutters in BO7)"
          description="Disables Windows' GPU Timeout Detection & Recovery resets that trigger under heavy BO7 load — especially during large Skirmish lobbies or Zombies boss fights. Prevents the brief black-screen flicker when the GPU watchdog incorrectly flags the IW 9.0 engine as hung. Restart recommended."
          onEnable={() => invoke("cod_gpu_tdr_fix", { enable: true })}
          onDisable={() => invoke("cod_gpu_tdr_fix", { enable: false })}
        />
        <ActionToggle
          storageKey="cod_vbs"
          label="Disable VBS & Memory Integrity (reduces kernel isolation overhead)"
          description="Turns off Virtualization Based Security and HVCI. VBS adds significant CPU overhead via kernel isolation — disabling it can recover 5–15% frame time on titles like BO7 that stress the CPU hard. Requires a restart to take full effect. Re-enable if you need enhanced security."
          onEnable={() => invoke("cod_disable_vbs", { enable: true })}
          onDisable={() => invoke("cod_disable_vbs", { enable: false })}
        />
        <ActionToggle
          storageKey="cod_prio"
          label="Boost CoD process priority to High (game must be running)"
          description="Sets the CPU scheduling priority of running CoD processes to High so Windows gives them more processor time. Launch the game first, then toggle this on. Note: Realtime priority is intentionally avoided as it starves mouse, keyboard and network drivers."
          onEnable={() => invoke("cod_process_priority", { enable: true })}
          onDisable={() => invoke("cod_process_priority", { enable: false })}
        />
      </div>

      {/* ── CPU & Network ─────────────────────────────────── */}
      <div style={card}>
        <div style={cardTitle}>CPU & Network</div>
        <ActionToggle
          storageKey="cod_pcores"
          label="Pin CoD to P-cores only (Intel 12th gen+ hybrid CPUs)"
          description="Sets CPU affinity for CoD processes to performance cores only, excluding efficiency cores. Eliminates thread contention micro-stutters on Intel 12th/13th/14th gen hybrid CPUs. Auto-detects P-core count. Game must be running — applies to live processes only."
          onEnable={() => invoke("cod_force_pcores", { enable: true })}
          onDisable={() => invoke("cod_force_pcores", { enable: false })}
        />
        <ActionToggle
          storageKey="cod_nat"
          label="Open CoD UDP ports in Windows Firewall (improves NAT type)"
          description="Adds inbound and outbound Windows Firewall rules for CoD's UDP ports (3074, 3478–3479, 27015–27036). Prevents NAT-related packet loss and high ping without needing router access. NAT type should improve to Open on next game launch."
          onEnable={() => invoke("cod_open_nat_ports", { enable: true })}
          onDisable={() => invoke("cod_open_nat_ports", { enable: false })}
        />
      </div>

      {/* ── Apply All ─────────────────────────────────────── */}
      <div style={card}>
        <div style={cardTitle}>Apply All</div>
        <p style={{ fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.7 }}>Apply every CoD optimization above in one click.</p>
        <CoDApplyAll />
      </div>
    </div>
  );
}

// ─── CoD Apply All ────────────────────────────────────────────────────────────
function CoDApplyAll() {
  const [status, setStatus] = useState("idle");
  const [log, setLog]       = useState([]);

  const STEPS = [
    ["adv_options.ini",          () => invoke("cod_adv_options",                      { enable: true }), "cod_adv"],
    ["Texture stream cap",        () => invoke("cod_config_texture_stream",             { enable: true }), "cod_texstream"],
    ["GPU upload heaps",          () => invoke("cod_gpu_upload_heaps",                 { enable: true }), "cod_gpuheaps"],
    ["Clear shader cache",        () => invoke("cod_shader_cache_clear"),                                  "cod_shaderclear"],
    ["Clear NVIDIA cache",        () => invoke("cod_clear_nvidia_cache"),                                  "cod_nvcache"],
    ["NTFS last-access",          () => invoke("cod_ntfs_tweaks",                      { enable: true }), "cod_ntfs"],
    ["Fullscreen optimizations",  () => invoke("cod_disable_fullscreen_optimizations", { enable: true }), "cod_fso"],
    ["Power throttling",          () => invoke("cod_disable_power_throttling",         { enable: true }), "cod_powerthrottle"],
    ["Timer coalescing",          () => invoke("cod_disable_timer_coalescing",         { enable: true }), "cod_timercoalesce"],
    ["Memory manager",            () => invoke("cod_large_system_cache",               { enable: true }), "cod_memcache"],
    ["GPU TDR fix",               () => invoke("cod_gpu_tdr_fix",                      { enable: true }), "cod_tdr"],
    ["Disable VBS",               () => invoke("cod_disable_vbs",                      { enable: true }), "cod_vbs"],
    ["P-core affinity",           () => invoke("cod_force_pcores",                     { enable: true }), "cod_pcores"],
    ["Open NAT ports",            () => invoke("cod_open_nat_ports",                   { enable: true }), "cod_nat"],
  ];

  async function applyAll() {
    setStatus("running"); setLog([]);
    STEPS.forEach(([, , key]) => sessionStorage.setItem(`toggle_${key}`, "true"));
    const results = [];
    for (const [label, fn] of STEPS) {
      try {
        await fn();
        results.push({ label, ok: true });
        historyAdd(`CoD: ${label}`, "Applied", true);
      } catch(e) {
        results.push({ label, ok: false, err: String(e) });
        historyAdd(`CoD: ${label}`, String(e), false);
      }
      setLog([...results]);
    }
    setStatus("done");
    showToast("All CoD tweaks applied");
  }

  const total     = STEPS.length;
  const doneCount = log.filter(l => l.ok).length;
  const failCount = log.filter(l => !l.ok).length;

  return (
    <div>
      <Btn primary onClick={applyAll} disabled={status === "running"}>
        {status === "running"
          ? `Applying... (${log.length}/${total})`
          : status === "done" ? "Apply again" : "⚡ Apply all CoD tweaks"}
      </Btn>
      {status === "running" && log.length > 0 && (
        <div style={{ marginTop: 10, height: 3, background: C.bg3, borderRadius: 2 }}>
          <div style={{ height: "100%", width: `${(log.length / total) * 100}%`, background: C.gold, borderRadius: 2, transition: "width 0.3s" }} />
        </div>
      )}
      {log.length > 0 && status === "done" && (
        <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 7, background: C.bg2, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.textMid, marginBottom: 10, letterSpacing: "0.06em" }}>
            <span style={{ color: C.gold }}>{doneCount} applied</span>
            {failCount > 0 && <> · <span style={{ color: "#e07070" }}>{failCount} failed</span></>}
          </div>
          {log.map(({ label, ok, err }) => (
            <div key={label} style={{ fontSize: 11, padding: "4px 0", color: ok ? C.gold : "#c05050", fontFamily: C.fontMono, borderBottom: `1px solid ${C.border}` }}>
              {ok ? "✓" : "✗"} {label}{err ? ` — ${err}` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Games page ────────────────────────────────────────────────────────────
function GamesPage() {
  const [games, setGames] = useState(null);
  const [scanning, setScanning] = useState(false);

  async function scan() {
    setScanning(true);
    try {
      const result = await invoke("scan_installed_games");
      setGames(result);
      historyAdd("Game scan", `Detected ${result.length} game(s)`, true);
      showToast(`Found ${result.length} game${result.length !== 1 ? "s" : ""}`);
    } catch(e) {
      setGames([]);
      historyAdd("Game scan", String(e), false);
      showToast("Scan failed", "error");
    }
    setScanning(false);
  }

  const sourceColors = { "Steam (registry)": "#1a9fff", "File system": C.gold, "Registry": "#a78bfa" };

  return (
    <div>
      <div style={card}>
        <div style={cardTitle}>Detected games</div>
        {games === null ? (
          <div>
            <p style={{ fontSize: 13, color: C.textMid, marginBottom: 18, lineHeight: 1.7 }}>Scans Steam libraries, Epic Games, common install folders and the Windows uninstall registry.</p>
            <Btn primary onClick={scan} disabled={scanning}>{scanning ? "Scanning..." : "Scan for games"}</Btn>
          </div>
        ) : scanning ? (
          <p style={{ fontSize: 13, color: C.textDim }}>Scanning...</p>
        ) : games.length === 0 ? (
          <div>
            <Empty message="No games detected. Make sure Steam / Epic is installed in a standard location." />
            <div style={{ marginTop: 12 }}><Btn onClick={scan}>Scan again</Btn></div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 11, color: C.textDim, marginBottom: 16, letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 12 }}>
              <span>{games.length} game{games.length !== 1 ? "s" : ""} found</span>
              <button onClick={scan} style={{ fontSize: 10, background: "none", border: "none", color: C.goldDim, cursor: "pointer", letterSpacing: "0.08em", textDecoration: "underline", textTransform: "uppercase", padding: 0 }}>Rescan</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {games.map(g => (
                <div key={g.path + g.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 7, background: C.bg2, border: `1px solid ${C.border}`, transition: "border-color 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = C.goldDim}
                  onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
                >
                  <div>
                    <div style={{ fontSize: 14, color: C.text, fontWeight: 600, fontFamily: C.fontUI }}>{g.name}</div>
                    <div style={{ fontSize: 10, color: C.textDim, fontFamily: C.fontMono, marginTop: 4, maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.path || "—"}</div>
                  </div>
                  <span style={{ fontSize: 9, padding: "3px 10px", borderRadius: 10, background: C.bg3, color: sourceColors[g.source] || C.textMid, letterSpacing: "0.08em", textTransform: "uppercase", flexShrink: 0, marginLeft: 12, border: `1px solid ${C.border}` }}>{g.source}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── History page ────────────────────────────────────────────────────────────
function HistoryPage() {
  const [entries, setEntries] = useState(() => historyGet());
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    function onUpdate() { setEntries(historyGet()); }
    window.addEventListener("framely_history_updated", onUpdate);
    return () => window.removeEventListener("framely_history_updated", onUpdate);
  }, []);
  function clearAll() { sessionStorage.removeItem(HISTORY_KEY); setEntries([]); }

  const filtered = filter === "all" ? entries : filter === "ok" ? entries.filter(e => e.ok) : entries.filter(e => !e.ok);

  return (
    <div>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={cardTitle}>Session history</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {["all", "ok", "err"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ fontSize: 10, padding: "4px 10px", borderRadius: 5, border: `1px solid ${filter === f ? C.goldDim : C.border}`, background: filter === f ? C.bg3 : "transparent", color: filter === f ? C.gold : C.textDim, cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: C.fontUI, fontWeight: 600 }}>
                {f === "all" ? "All" : f === "ok" ? "✓ OK" : "✗ Failed"}
              </button>
            ))}
            {entries.length > 0 && <button onClick={clearAll} style={{ fontSize: 10, background: "none", border: "none", color: C.textDim, cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase", textDecoration: "underline", marginLeft: 4 }}>Clear</button>}
          </div>
        </div>
        {filtered.length === 0 ? <Empty message="No activity yet. Apply optimizations to start tracking." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {filtered.map(e => (
              <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", marginTop: 5, flexShrink: 0, background: e.ok ? C.gold : "#c05050" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: C.text, fontFamily: C.fontUI, fontWeight: 600, letterSpacing: "0.04em" }}>{e.label}</div>
                  <div style={{ fontSize: 11, color: e.ok ? C.textMid : "#c05050", fontFamily: C.fontMono, marginTop: 3 }}>{e.result}</div>
                </div>
                <div style={{ fontSize: 10, color: C.textDim, letterSpacing: "0.06em", fontFamily: C.fontMono, flexShrink: 0, textAlign: "right" }}>
                  <div>{e.time}</div>
                  <div style={{ marginTop: 2 }}>{e.date}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Settings persistence ─────────────────────────────────────────────────────
const SETTINGS_KEY = "framely_settings";
function settingsGet() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch { return {}; }
}
function settingsSave(key, val) {
  const s = settingsGet();
  s[key] = val;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// ─── Settings page ────────────────────────────────────────────────────────────
function SettingsPage() {
  const [applying, setApplying] = useState(false);
  const saved = settingsGet();

  useEffect(() => {
    const s = settingsGet();
    const tasks = [
      [s.gameBar       === false, () => invoke("set_game_bar",                { enable: false })],
      [s.gpuScheduling === true,  () => invoke("set_gpu_scheduling",          { enable: true  })],
      [s.mouseAccel    === true,  () => invoke("fivem_mouse_accel",           { enable: true  })],
      [s.devPowerSave  === true,  () => invoke("disable_device_power_saving", { enable: true  })],
      [s.flushDns      === true,  () => invoke("flush_dns_cache",             { enable: true  })],
      [s.fpsOverlay    === true,  () => invoke("start_fps_overlay")],
    ];
    tasks.forEach(([should, fn]) => { if (should) fn().catch(() => {}); });
  }, []);

  async function resetAll() {
    setApplying(true);
    try {
      await Promise.allSettled([
        invoke("set_game_bar",                { enable: true  }),
        invoke("set_gpu_scheduling",          { enable: false }),
        invoke("fivem_mouse_accel",           { enable: false }),
        invoke("disable_device_power_saving", { enable: false }),
        invoke("stop_fps_overlay"),
      ]);
      localStorage.removeItem(SETTINGS_KEY);
      showToast("All settings reset to Windows defaults");
      window.dispatchEvent(new Event("framely_settings_reset"));
    } catch(e) {
      showToast("Reset failed", "error");
    }
    setApplying(false);
  }

  return (
    <div>
      <div style={card}>
        <div style={cardTitle}>System tweaks</div>
        <p style={{ fontSize: 12, color: C.textDim, marginBottom: 16, lineHeight: 1.6, letterSpacing: "0.04em" }}>
          These settings are applied immediately and persist across Framely restarts.
        </p>
        <PersistToggle
          storageKey="gameBar"
          label="Disable Windows Game Bar"
          description="Prevents Game Bar overlays from interrupting gameplay and consuming resources."
          onEnable={() => invoke("set_game_bar",   { enable: false })}
          onDisable={() => invoke("set_game_bar",  { enable: true  })}
          defaultOn={saved.gameBar === false ? true : false}
          invertStorage
        />
        <PersistToggle
          storageKey="gpuScheduling"
          label="Hardware-accelerated GPU scheduling"
          description="Lets the GPU manage its own memory scheduling, reducing CPU overhead."
          onEnable={() => invoke("set_gpu_scheduling",  { enable: true  })}
          onDisable={() => invoke("set_gpu_scheduling", { enable: false })}
          defaultOn={saved.gpuScheduling === true}
        />
        <PersistToggle
          storageKey="mouseAccel"
          label="Disable mouse acceleration"
          description="Forces 1:1 linear pointer movement — essential for consistent aim."
          onEnable={() => invoke("fivem_mouse_accel",  { enable: true  })}
          onDisable={() => invoke("fivem_mouse_accel", { enable: false })}
          defaultOn={saved.mouseAccel === true}
        />
        <PersistToggle
          storageKey="devPowerSave"
          label="Disable device power saving"
          description="Prevents Windows from throttling NICs, USB hubs, and PCIe devices to save power."
          onEnable={() => invoke("disable_device_power_saving",  { enable: true  })}
          onDisable={() => invoke("disable_device_power_saving", { enable: false })}
          defaultOn={saved.devPowerSave === true}
        />
        <PersistToggle
          storageKey="flushDns"
          label="Flush DNS cache on Framely launch"
          description="Clears stale DNS entries each time Framely starts so connections resolve fresh."
          onEnable={() => invoke("flush_dns_cache", { enable: true })}
          onDisable={null}
          defaultOn={saved.flushDns === true}
          oneWay
        />
        <PersistToggle
          storageKey="fpsOverlay"
          label="FPS Overlay"
          description="Shows a live FPS counter on top of your game. Requires PresentMon to be bundled."
          onEnable={() => invoke("start_fps_overlay")}
          onDisable={() => invoke("stop_fps_overlay")}
          defaultOn={saved.fpsOverlay === true}
        />
      </div>
      <div style={card}>
        <div style={cardTitle}>Preferences</div>
        <PrefToggle storageKey="usageStats" label="Send anonymous usage stats" description="Helps us understand which optimizations are most useful. No personal data." />
      </div>
      <div style={card}>
        <div style={cardTitle}>Reset</div>
        <p style={{ fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.7 }}>
          Undo all system tweaks above and restore Windows defaults.
        </p>
        <Btn danger onClick={resetAll} disabled={applying}>{applying ? "Resetting..." : "Reset all to Windows defaults"}</Btn>
      </div>
    </div>
  );
}

// ─── PersistToggle ────────────────────────────────────────────────────────────
function PersistToggle({ storageKey, label, description, onEnable, onDisable, defaultOn = false, invertStorage = false, oneWay = false }) {
  const [on, setOn] = useState(defaultOn);
  const [status, setStatus] = useState("idle");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    function onReset() { setOn(false); setStatus("idle"); setMsg(""); }
    window.addEventListener("framely_settings_reset", onReset);
    return () => window.removeEventListener("framely_settings_reset", onReset);
  }, []);

  async function handleToggle() {
    const next = !on;
    setOn(next); setStatus("loading"); setMsg("");
    try {
      const fn = next ? onEnable : onDisable;
      let result = next ? "Enabled" : "Disabled";
      if (fn) { result = await fn(); result = typeof result === "string" ? result : "Done"; }
      settingsSave(storageKey, invertStorage ? !next : next);
      setMsg(result); setStatus("ok");
      historyAdd(`Settings: ${label} — ${next ? "ON" : "OFF"}`, result, true);
      showToast(`${label} — ${next ? "On" : "Off"}`);
    } catch(e) {
      const err = typeof e === "string" ? e : "Failed";
      setMsg(err); setStatus("err"); setOn(!next);
      historyAdd(`Settings: ${label} — ${next ? "ON" : "OFF"}`, err, false);
      showToast(err, "error");
    }
    setTimeout(() => setStatus("idle"), 3500);
  }

  return (
    <div style={{ padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: on ? C.text : C.textMid, fontFamily: C.fontUI, fontWeight: on ? 600 : 500, letterSpacing: "0.04em", transition: "color 0.2s", marginBottom: 3 }}>{label}</div>
          <div style={{ fontSize: 11, color: C.textDim, letterSpacing: "0.04em", lineHeight: 1.5 }}>{description}</div>
          {status !== "idle" && (
            <div style={{ fontSize: 10, marginTop: 5, letterSpacing: "0.06em", color: status === "err" ? "#c05050" : status === "loading" ? C.textDim : C.gold }}>
              {status === "loading" ? "Applying..." : msg}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <div
            onClick={status === "loading" ? undefined : handleToggle}
            title={on ? "Click to disable" : "Click to enable"}
            style={{
              width: 36, height: 20, borderRadius: 10,
              cursor: status === "loading" ? "wait" : "pointer",
              background: on ? C.gold : C.bg3,
              border: `1px solid ${on ? C.goldDim : C.border}`,
              position: "relative", transition: "all 0.2s",
              opacity: status === "loading" ? 0.5 : 1,
              boxShadow: on ? `0 0 10px rgba(212,170,60,0.25)` : "none",
            }}
          >
            <div style={{ position: "absolute", top: 3, left: on ? 16 : 3, width: 12, height: 12, borderRadius: "50%", background: on ? "#080808" : C.textDim, transition: "left 0.2s" }} />
          </div>
          {oneWay && on && (
            <div style={{ fontSize: 9, color: C.textDim, letterSpacing: "0.06em", textAlign: "center" }}>on launch</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PrefToggle ───────────────────────────────────────────────────────────────
function PrefToggle({ storageKey, label, description }) {
  const [on, setOn] = useState(() => settingsGet()[storageKey] === true);

  useEffect(() => {
    function onReset() { setOn(false); }
    window.addEventListener("framely_settings_reset", onReset);
    return () => window.removeEventListener("framely_settings_reset", onReset);
  }, []);

  function handleToggle() {
    const next = !on;
    setOn(next);
    settingsSave(storageKey, next);
    showToast(`${label} — ${next ? "On" : "Off"}`);
  }

  return (
    <div style={{ padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: on ? C.text : C.textMid, fontFamily: C.fontUI, fontWeight: on ? 600 : 500, letterSpacing: "0.04em", transition: "color 0.2s", marginBottom: 3 }}>{label}</div>
          {description && <div style={{ fontSize: 11, color: C.textDim, letterSpacing: "0.04em", lineHeight: 1.5 }}>{description}</div>}
        </div>
        <div
          onClick={handleToggle}
          style={{ width: 36, height: 20, borderRadius: 10, cursor: "pointer", background: on ? C.gold : C.bg3, border: `1px solid ${on ? C.goldDim : C.border}`, position: "relative", transition: "all 0.2s", flexShrink: 0, boxShadow: on ? `0 0 10px rgba(212,170,60,0.25)` : "none" }}
        >
          <div style={{ position: "absolute", top: 3, left: on ? 16 : 3, width: 12, height: 12, borderRadius: "50%", background: on ? "#080808" : C.textDim, transition: "left 0.2s" }} />
        </div>
      </div>
    </div>
  );
}

// ─── ActionToggle ────────────────────────────────────────────────────────────
function ActionToggle({ label, description, onEnable, onDisable, storageKey }) {
  const [on, setOn] = useState(() => {
    if (!storageKey) return false;
    try { return sessionStorage.getItem(`toggle_${storageKey}`) === "true"; } catch { return false; }
  });
  const [status, setStatus] = useState("idle");
  const [msg, setMsg] = useState("");

  async function handleToggle() {
    const next = !on; setOn(next); setStatus("loading"); setMsg("");
    try {
      const fn = next ? onEnable : onDisable;
      let result = next ? "Enabled" : "Disabled";
      if (fn) { result = await fn(); result = typeof result === "string" ? result : "Done"; }
      if (storageKey) sessionStorage.setItem(`toggle_${storageKey}`, String(next));
      setMsg(result); setStatus("ok");
      historyAdd(`${label} — ${next ? "ON" : "OFF"}`, result, true);
      showToast(`${label.slice(0, 36)} — ${next ? "On" : "Off"}`);
    } catch(e) {
      const err = typeof e === "string" ? e : "Failed";
      setMsg(err); setStatus("err"); setOn(!next);
      if (storageKey) sessionStorage.setItem(`toggle_${storageKey}`, String(!next));
      historyAdd(`${label} — ${next ? "ON" : "OFF"}`, err, false);
      showToast(err, "error");
    }
    setTimeout(() => setStatus("idle"), 3000);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: `1px solid ${C.border}`, gap: 16 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: on ? C.text : C.textMid, fontFamily: C.fontUI, fontWeight: on ? 600 : 500, letterSpacing: "0.04em", transition: "color 0.2s", marginBottom: description ? 3 : 0 }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: C.textDim, letterSpacing: "0.04em", lineHeight: 1.5 }}>{description}</div>}
        {status !== "idle" && (
          <div style={{ fontSize: 10, marginTop: 4, letterSpacing: "0.06em", color: status === "err" ? "#c05050" : status === "loading" ? C.textDim : C.gold }}>
            {status === "loading" ? "Working..." : msg}
          </div>
        )}
      </div>
      <div
        onClick={status === "loading" ? undefined : handleToggle}
        title={on ? "Click to disable" : "Click to enable"}
        style={{
          width: 36, height: 20, borderRadius: 10, cursor: status === "loading" ? "wait" : "pointer",
          background: on ? C.gold : C.bg3,
          border: `1px solid ${on ? C.goldDim : C.border}`,
          position: "relative", transition: "all 0.2s", flexShrink: 0,
          opacity: status === "loading" ? 0.5 : 1,
          boxShadow: on ? `0 0 10px rgba(212,170,60,0.25)` : "none",
        }}
      >
        <div style={{ position: "absolute", top: 3, left: on ? 16 : 3, width: 12, height: 12, borderRadius: "50%", background: on ? "#080808" : C.textDim, transition: "left 0.2s" }} />
      </div>
    </div>
  );
}