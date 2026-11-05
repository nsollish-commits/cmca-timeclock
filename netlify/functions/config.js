import { getStore } from "@netlify/blobs";
import { json, NO_CACHE, getPasscode, isValidToken } from "./lib/auth.js";

// GET  /api/config -> public settings only (name, lat, lng, radius, teachers).
//   The admin passcode is NEVER returned here. It used to be, which meant
//   anyone could fetch /api/config and read it.
// POST /api/config {name, lat, lng, radius, teachers} -> admin token required.
// POST /api/config {action:"set-pass", newPass}       -> admin token required.

function publicConfig(cfg) {
  if (!cfg) return null;
  return {
    name: cfg.name || "School",
    lat: cfg.lat,
    lng: cfg.lng,
    radius: cfg.radius || 300,
    teachers: Array.isArray(cfg.teachers) ? cfg.teachers : [],
  };
}

export default async (req) => {
  const store = getStore("cmca-timeclock");

  if (req.method === "GET") {
    const cfg = await store.get("config", { type: "json" });
    return new Response(JSON.stringify(publicConfig(cfg)), { headers: NO_CACHE });
  }

  if (req.method === "POST") {
    if (!(await isValidToken(store, req))) {
      return json({ error: "Admin sign-in required." }, 401);
    }
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Bad request." }, 400);
    }

    if (body.action === "set-pass") {
      const next = (body.newPass || "").trim();
      if (next.length < 4) return json({ error: "Passcode must be at least 4 characters." }, 400);
      await store.set("admin-pass", next);
      return json({ ok: true });
    }

    const cfg = (await store.get("config", { type: "json" })) || {};
    const nextCfg = {
      ...cfg,
      name: (body.name || cfg.name || "School").trim(),
      lat: body.lat,
      lng: body.lng,
      radius: body.radius || 300,
      teachers: Array.isArray(body.teachers) ? body.teachers : cfg.teachers || [],
    };
    // Never persist a passcode inside the config blob again.
    delete nextCfg.adminPass;
    await store.setJSON("config", nextCfg);
    return json({ ok: true, config: publicConfig(nextCfg) });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/api/config" };
