import { useState } from "react";
import { activateKey, isValidFormat } from "../lib/license";
import { FramelyLogo, TitleBar, C } from "../App";

export default function ActivationScreen({ onActivated }) {
  const [key, setKey]           = useState("");
  const [status, setStatus]     = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function handleKeyInput(e) {
    // Payhip keys — trim whitespace, preserve case
    setKey(e.target.value.trim());
  }

  async function handleActivate() {
    if (!isValidFormat(key)) {
      setStatus("error");
      setErrorMsg("Please enter your license key from your Payhip purchase.");
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    try {
      await activateKey(key);
      setStatus("success");
      setTimeout(onActivated, 800);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message || "Could not activate. Check your key and try again.");
    }
  }

  const validFormat = isValidFormat(key);

  const borderColor =
    status === "error" ? "#8b2e2e" :
    validFormat        ? C.gold    :
                         C.border;

  return (
    <div style={{ background: C.bg0, height: "100vh", position: "relative" }}>
      <TitleBar />

      {/* Subtle gold corner accents */}
      <div style={{ position: "fixed", top: 36, left: 0, width: 60, height: 1, background: `linear-gradient(to right, ${C.goldDim}, transparent)` }}/>
      <div style={{ position: "fixed", top: 36, right: 0, width: 60, height: 1, background: `linear-gradient(to left, ${C.goldDim}, transparent)` }}/>

      <div style={{
        height: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", paddingTop: 36,
      }}>
        <div style={{
          background: C.bg1,
          border: `1px solid ${C.border}`,
          borderTop: `1px solid ${C.goldDim}`,
          borderRadius: 10,
          padding: "38px 42px",
          width: 430,
          boxShadow: `0 0 40px rgba(0,0,0,0.8), 0 0 0 1px ${C.border}`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 30 }}>
            <FramelyLogo size={38} />
            <div>
              <div style={{
                fontSize: 20, fontWeight: 700, color: C.text,
                letterSpacing: "0.16em", textTransform: "uppercase",
                fontFamily: C.fontUI,
              }}>Framely</div>
              <div style={{ fontSize: 10, color: C.textMid, marginTop: 2, letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: C.fontUI, fontWeight: 600 }}>
                PC Optimizer for Gamers
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: `linear-gradient(to right, transparent, ${C.border}, transparent)`, marginBottom: 26 }} />

          <div style={{ fontSize: 11, fontWeight: 700, color: C.goldDim, marginBottom: 5, letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: C.fontUI }}>
            Activation Key
          </div>
          <div style={{ fontSize: 12, color: C.textMid, marginBottom: 20, lineHeight: 1.6 }}>
            Enter the license key from your{" "}
            <a href="https://payhip.com/" target="_blank" rel="noreferrer"
               style={{ color: C.gold, textDecoration: "none", cursor: "pointer" }}>
              Payhip purchase
            </a>.
          </div>

          {/* Input */}
          <div style={{ position: "relative", marginBottom: 10 }}>
            <input
              style={{
                width: "100%", background: C.bg0,
                border: `1px solid ${borderColor}`,
                borderRadius: 6, color: C.text, fontSize: 13,
                padding: "12px 40px 12px 14px", outline: "none",
                fontFamily: C.fontMono,
                letterSpacing: "0.06em",
                boxSizing: "border-box",
                caretColor: C.gold,
                transition: "border-color 0.2s",
              }}
              value={key}
              onChange={handleKeyInput}
              onKeyDown={e => e.key === "Enter" && handleActivate()}
              placeholder="Enter your Payhip license key"
              spellCheck={false}
              autoComplete="off"
              disabled={status === "loading" || status === "success"}
            />
            {validFormat && status !== "error" && (
              <div style={{
                position: "absolute", right: 13, top: "50%",
                transform: "translateY(-50%)", color: C.gold, fontSize: 13,
              }}>✓</div>
            )}
          </div>

          {status === "error" && (
            <p style={{ fontSize: 11, color: "#c05050", margin: "0 0 12px", lineHeight: 1.5 }}>{errorMsg}</p>
          )}

          {/* Button */}
          <button
            onClick={handleActivate}
            disabled={status === "loading" || status === "success"}
            onMouseEnter={e => { if (status === "idle") e.currentTarget.style.background = C.goldLight; }}
            onMouseLeave={e => { if (status === "idle") e.currentTarget.style.background = C.gold; }}
            style={{
              width: "100%", padding: "12px 0", borderRadius: 6, border: "none",
              background: status === "success" ? C.goldDim : C.gold,
              color: "#080808", fontSize: 13, fontWeight: 700,
              cursor: status === "loading" ? "wait" : "pointer",
              marginTop: 6, fontFamily: C.fontUI,
              letterSpacing: "0.16em", textTransform: "uppercase",
              opacity: status === "loading" ? 0.7 : 1,
              transition: "background 0.15s",
            }}
          >
            {status === "loading" ? "Activating..." :
             status === "success" ? "Activated — Launching..." :
             "Activate Framely"}
          </button>

          <p style={{
            fontSize: 10, color: C.textDim, textAlign: "center",
            marginTop: 18, letterSpacing: "0.06em",
          }}>
            Each key supports up to 1 device · Non-transferable
          </p>
        </div>
      </div>
    </div>
  );
}