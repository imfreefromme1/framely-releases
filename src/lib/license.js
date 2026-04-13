import { invoke } from "@tauri-apps/api/core";

const STORAGE_KEY = "framely_license";

// ── Machine ID ────────────────────────────────────────────
export async function getMachineId() {
  return await invoke("get_machine_id");
}

// ── Key format helpers ────────────────────────────────────
export function isValidFormat(key) {
  const trimmed = key.trim();
  return trimmed.length >= 8 && !trimmed.includes(" ");
}

// ── Activate ──────────────────────────────────────────────
export async function activateKey(key) {
  const machineId = await getMachineId();
  const raw = await invoke("validate_license", { key: key.trim(), machineId });
  const result = JSON.parse(raw);

  if (!result.valid) {
    throw new Error(result.reason || "Activation failed");
  }

  await invoke("save_license", { key: key.trim(), machineId });

  const license = {
    key: key.trim(),
    machineId,
    plan: result.plan,
    isLifetime: result.is_lifetime === true,
    activatedAt: Date.now(),
    expiresAt: result.expires_at ? Number(result.expires_at) * 1000 : null,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(license));

  return license;
}

// ── Get stored metadata ───────────────────────────────────
export function getStoredLicense() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getLicenseExpiry() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const license = JSON.parse(raw);
    return {
      plan: license.plan,
      isLifetime: license.isLifetime,
      expiresAt: license.expiresAt,
    };
  } catch {
    return null;
  }
}

// ── Validate stored license on launch ─────────────────────
export async function validateStoredLicense(license) {
  try {
    const savedKey = await invoke("get_saved_license");
    if (!savedKey) {
      clearLicense();
      return false;
    }

    const machineId = await getMachineId();
    const raw = await invoke("validate_license", { key: savedKey, machineId });
    const result = JSON.parse(raw);

    if (!result.valid) {
      clearLicense();
      return false;
    }

    const updated = {
      ...license,
      plan: result.plan,
      isLifetime: result.is_lifetime === true,
      expiresAt: result.expires_at ? Number(result.expires_at) * 1000 : null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    return true;
  } catch {
    // Network down — allow offline grace period of 3 days
    const daysSinceActivation = (Date.now() - (license.activatedAt || 0)) / 86400000;
    if (license.expiresAt && Date.now() > license.expiresAt) {
      return false;
    }
    return daysSinceActivation < 3;
  }
}

// ── Clear ─────────────────────────────────────────────────
export async function clearLicense() {
  localStorage.removeItem(STORAGE_KEY);
  try { await invoke("clear_license"); } catch {}
}