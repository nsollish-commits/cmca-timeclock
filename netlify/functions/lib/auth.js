import { getStore } from "@netlify/blobs";

// Shared helpers for the timeclock functions: admin tokens and the
// passcode live in their own blob keys and are NEVER returned to clients.
export const NO_CACHE = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: NO_CACHE });
}

const DEFAULT_PASSCODE = "setup2026"; // first-time passcode; change it from Admin after first login

export async function getPasscode(store) {
  const saved = await store.get("admin-pass", { type: "text" });
  if (saved) return saved;
  // Legacy: the passcode used to live inside the config blob.
  const cfg = await store.get("config", { type: "json" });
  if (cfg && cfg.adminPass) {
    await store.set("admin-pass", cfg.adminPass);
    return cfg.adminPass;
  }
  return DEFAULT_PASSCODE;
}

export async function readTokens(store) {
  const tokens = await store.get("admin-tokens", { type: "json" });
  return tokens && typeof tokens === "object" ? tokens : {};
}

export async function createToken(store) {
  const tokens = await readTokens(store);
  const token =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "t_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  const now = Date.now();
  // Prune expired tokens while we're here.
  for (const [t, exp] of Object.entries(tokens)) {
    if (exp <= now) delete tokens[t];
  }
  tokens[token] = now + 24 * 60 * 60 * 1000; // 24 hours
  await store.setJSON("admin-tokens", tokens);
  return token;
}

export async function isValidToken(store, req) {
  const token = req.headers.get("x-admin-token");
  if (!token) return false;
  const tokens = await readTokens(store);
  const exp = tokens[token];
  if (!exp || exp <= Date.now()) return false;
  return true;
}

// A punch made in the last 10 minutes may be undone by its owner without
// an admin token (the Undo button). Anything older needs an admin.
export function isRecentPunch(record) {
  if (!record || !record.ts) return false;
  const age = Date.now() - new Date(record.ts).getTime();
  return age >= 0 && age <= 10 * 60 * 1000;
}
