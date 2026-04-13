// ============================================================
// Framely License Backend — Supabase Edge Functions
// Deploy these two functions to your Supabase project.
// supabase functions deploy activate
// supabase functions deploy validate
// ============================================================

// ─── SUPABASE SQL SCHEMA ─────────────────────────────────────
// Run this in your Supabase SQL editor first:
//
// create table licenses (
//   id uuid primary key default gen_random_uuid(),
//   key text unique not null,
//   email text,
//   plan text default 'pro',
//   max_activations int default 2,
//   machine_ids text[] default '{}',
//   activation_count int default 0,
//   active boolean default true,
//   created_at timestamptz default now(),
//   revoked_at timestamptz
// );
//
// create table activation_logs (
//   id uuid primary key default gen_random_uuid(),
//   key text references licenses(key),
//   machine_id text,
//   action text, -- 'activate' | 'validate' | 'revoke'
//   ip text,
//   created_at timestamptz default now()
// );
// ─────────────────────────────────────────────────────────────


// ============================================================
// FUNCTION 1: /activate
// Called when a user enters their key for the first time.
// ============================================================
export async function activate(req, supabase) {
  const { key, machineId } = await req.json();

  if (!key || !machineId) {
    return error("Missing key or machineId", 400);
  }

  // Look up the license
  const { data: license, error: dbErr } = await supabase
    .from("licenses")
    .select("*")
    .eq("key", key)
    .single();

  if (dbErr || !license) return error("Invalid license key", 404);
  if (!license.active) return error("This license has been revoked", 403);

  // Check if this machine is already registered
  const alreadyRegistered = license.machine_ids.includes(machineId);

  if (!alreadyRegistered) {
    // Check activation limit
    if (license.activation_count >= license.max_activations) {
      // Flag for potential sharing — auto-revoke after threshold
      await logAction(supabase, key, machineId, "activation_denied", req);
      return error(
        `Activation limit reached (${license.max_activations} devices max). Contact support@framely.gg to transfer your license.`,
        403
      );
    }

    // Register new machine
    const { error: updateErr } = await supabase
      .from("licenses")
      .update({
        machine_ids: [...license.machine_ids, machineId],
        activation_count: license.activation_count + 1,
      })
      .eq("key", key);

    if (updateErr) return error("Activation failed. Please try again.", 500);
  }

  // Generate a session token for this machine
  const token = await generateToken(key, machineId);
  await logAction(supabase, key, machineId, "activate", req);

  return ok({ success: true, token, plan: license.plan });
}


// ============================================================
// FUNCTION 2: /validate
// Called on every app launch to verify the license is still valid.
// ============================================================
export async function validate(req, supabase) {
  const { key, machineId, token } = await req.json();

  if (!key || !machineId || !token) {
    return error("Missing fields", 400);
  }

  // Verify token matches what we'd generate
  const expectedToken = await generateToken(key, machineId);
  if (token !== expectedToken) {
    return error("Invalid token", 403);
  }

  // Check license is still active and machine is registered
  const { data: license } = await supabase
    .from("licenses")
    .select("active, machine_ids")
    .eq("key", key)
    .single();

  if (!license || !license.active) {
    return ok({ valid: false, reason: "revoked" });
  }

  if (!license.machine_ids.includes(machineId)) {
    return ok({ valid: false, reason: "machine_not_registered" });
  }

  await logAction(supabase, key, machineId, "validate", req);
  return ok({ valid: true });
}


// ─── Helpers ─────────────────────────────────────────────────

async function generateToken(key, machineId) {
  const secret = Deno.env.get("LICENSE_SECRET") ?? "change-this-secret";
  const data = new TextEncoder().encode(`${key}:${machineId}:${secret}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function logAction(supabase, key, machineId, action, req) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  await supabase.from("activation_logs").insert({ key, machineId, action, ip });
}

function ok(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function error(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
