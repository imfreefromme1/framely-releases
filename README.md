# Framely — PC Optimizer for Gamers

## Project Structure

```
framely/
├── src/                        # React frontend
│   ├── App.jsx                 # Root — routes activation vs dashboard
│   ├── main.jsx                # React entry point
│   ├── pages/
│   │   ├── ActivationScreen.jsx  # Key entry UI
│   │   └── Dashboard.jsx         # Main app UI
│   └── lib/
│       └── license.js            # All license validation logic
├── src-tauri/                  # Rust backend (Tauri)
│   ├── src/main.rs             # Machine fingerprinting, system commands
│   ├── Cargo.toml
│   └── tauri.conf.json         # App config, window size, updater
├── backend/
│   ├── license-functions.js    # Supabase Edge Functions (activate + validate)
│   └── generate-keys.js        # CLI tool to generate + revoke keys
├── index.html
├── vite.config.js
└── package.json
```

---

## Setup Guide

### 1. Install prerequisites (Windows)

```bash
# Install Node.js (v18+): https://nodejs.org
# Install Rust: https://rustup.rs
# Install Tauri CLI prerequisites:
# https://tauri.app/v1/guides/getting-started/prerequisites

npm install
```

### 2. Set up Supabase

1. Create a free project at https://supabase.com
2. Go to SQL Editor and run the schema from the top of `backend/license-functions.js`
3. Deploy the Edge Functions:
```bash
supabase functions deploy activate
supabase functions deploy validate
```
4. Set the `LICENSE_SECRET` environment variable in Supabase dashboard → Edge Functions → Secrets

### 3. Update your config

In `src/lib/license.js`, replace:
```js
const API_BASE = "https://your-supabase-project.supabase.co/functions/v1";
```

In `src-tauri/tauri.conf.json`, replace:
```json
"https://your-supabase-project.supabase.co"
```

### 4. Run in development

```bash
npm run tauri dev
```

### 5. Build the .exe

```bash
npm run tauri build
```
Output: `src-tauri/target/release/bundle/msi/Framely_1.0.0_x64_en-US.msi`

---

## Generating License Keys

```bash
# Generate 1 key
node backend/generate-keys.js generate 1

# Generate 10 keys (e.g. for a batch sale)
node backend/generate-keys.js generate 10

# Revoke a key (chargeback, shared key detected)
node backend/generate-keys.js revoke XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
```

---

## Anti-Piracy Summary

| Layer | What it does |
|---|---|
| Online activation | Key must validate against your server — no offline cracks |
| Machine fingerprinting | Key locked to hardware — sharing keys across PCs gets flagged |
| Activation limit | Max 2 devices per key — 3rd attempt is denied and logged |
| Session token | Cryptographic token ties key + machine together |
| Launch validation | App phones home every launch — revoked keys lock out instantly |
| 7-day grace period | Offline users get 7 days before lockout — prevents false bans |
| Key revocation | Instant remote revocation from your Supabase dashboard |
| Code signing | Sign the .exe so Windows doesn't flag it as malware |

---

## Lemon Squeezy Integration (Payments)

1. Create a product at https://lemonsqueezy.com
2. Add a webhook → point it to a Supabase Edge Function
3. On `order_created` event, call `generate-keys.js` to insert a key
4. Email the key to the customer automatically via Resend

---

## Recommended Next Steps

1. Add actual PC optimization logic in `src-tauri/src/main.rs`
2. Integrate real Steam/game detection via registry reads
3. Add code signing cert (~$50/yr from Certum)
4. Set up auto-updater endpoint on framely.gg
5. Build the marketing site at framely.gg
