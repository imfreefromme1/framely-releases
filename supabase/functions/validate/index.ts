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

  const { key, machineId, token } = await req.json();
  if (!key || !machineId || !token) return err("Missing fields", 400);

  const expected = await generateToken(key, machineId);
  if (token !== expected) return err("Invalid token", 403);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: license, error } = await supabase
    .from("licenses").select("active, machine_ids").eq("key", key).single();

  if (error) return err("DB error: " + error.message, 500);
  if (!license || !license.active) return ok({ valid: false, reason: "revoked" });
  if (!license.machine_ids.includes(machineId)) return ok({ valid: false, reason: "machine_not_registered" });

  await supabase.from("activation_logs").insert({ key, machine_id: machineId, action: "validate" });
  return ok({ valid: true });
});

async function generateToken(key: string, machineId: string) {
  const secret = Deno.env.get("LICENSE_SECRET") ?? "change-me";
  const data = new TextEncoder().encode(`${key}:${machineId}:${secret}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const err = (message: string, status = 400) => new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });