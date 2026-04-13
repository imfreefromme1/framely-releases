import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const { key, machineId } = await req.json();
  if (!key || !machineId) return err("Missing key or machineId", 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: license, error } = await supabase
    .from("licenses").select("*").eq("key", key).single();

  if (error) return err("DB error: " + error.message, 500);
  if (!license) return err("Invalid license key", 404);
  if (!license.active) return err("License revoked", 403);

  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    return err("License expired. Please renew at framely.gg", 403);
  }

  const alreadyRegistered = license.machine_ids.includes(machineId);

  if (!alreadyRegistered) {
    if (license.activation_count >= license.max_activations)
      return err("Activation limit reached. Contact support@framely.gg", 403);

    await supabase.from("licenses").update({
      machine_ids: [...license.machine_ids, machineId],
      activation_count: license.activation_count + 1,
    }).eq("key", key);
  }

  const token = await generateToken(key, machineId);
  await supabase.from("activation_logs").insert({ key, machine_id: machineId, action: "activate" });

  return ok({ success: true, token, plan: license.plan, expires_at: license.expires_at });
});

async function generateToken(key: string, machineId: string) {
  const secret = Deno.env.get("LICENSE_SECRET") ?? "change-me";
  const data = new TextEncoder().encode(`${key}:${machineId}:${secret}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const err = (message: string, status = 400) => new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });