import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://uukcwgtbuhccgbmhzqpf.supabase.co";
const SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1a2N3Z3RidWhjY2dibWh6cXBmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTg3Mzk5NCwiZXhwIjoyMDkxNDQ5OTk0fQ.QQXuHfxEtO6VVqOv3QBh51SD_JusOWMywkoQXl-qB9U";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function generateKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segments = [];
  for (let s = 0; s < 5; s++) {
    let segment = "";
    for (let i = 0; i < 5; i++) {
      segment += chars[crypto.randomInt(chars.length)];
    }
    segments.push(segment);
  }
  return segments.join("-");
}

async function generateAndStore(count = 1, plan = "lifetime") {
  let expiresAt = null;
  if (plan === "7day") expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  if (plan === "30day") expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const keys = [];
  for (let i = 0; i < count; i++) {
    keys.push({
      key: generateKey(),
      plan,
      max_activations: 1,
      active: true,
      expires_at: expiresAt,
    });
  }

  const { data, error } = await supabase.from("licenses").insert(keys).select("key");

  if (error) {
    console.error("Failed to insert keys:", error.message);
    return;
  }

  console.log(`\nGenerated ${count} ${plan} key(s):\n`);
  data.forEach(({ key }) => console.log(`  ${key}`));
  console.log();
}

async function revokeKey(key) {
  const { error } = await supabase
    .from("licenses")
    .update({ active: false, revoked_at: new Date().toISOString() })
    .eq("key", key);

  if (error) console.error("Failed to revoke:", error.message);
  else console.log(`Revoked: ${key}`);
}

const [,, command, arg, planArg] = process.argv;
if (command === "generate") {
  await generateAndStore(parseInt(arg) || 1, planArg || "lifetime");
} else if (command === "revoke") {
  await revokeKey(arg);
} else {
  console.log("Usage:");
  console.log("  node generate-keys.js generate [count] [7day|30day|lifetime]");
  console.log("  node generate-keys.js revoke XXXXX-XXXXX-XXXXX-XXXXX-XXXXX");
}