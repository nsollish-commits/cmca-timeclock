import { getStore } from "@netlify/blobs";
import { json, NO_CACHE, isValidToken, isRecentPunch } from "./lib/auth.js";

// Records are stored ONE BLOB PER PUNCH (key "rec_<id>") instead of a
// single shared array. The old design made every teacher's phone download
// the whole list, add one punch, and upload the whole list back — when two
// teachers punched at the same time, one punch silently overwrote the other.
// Single-record writes cannot clobber each other.
//
// GET  /api/records            -> all records, oldest first
// POST /api/records {record}   -> append one punch {id, teacherName, type, ts, ...}
// POST /api/records {action:"delete", id}            -> admin (or recent-punch undo)
// POST /api/records {action:"update", id, patch}     -> admin only
//
// Record types: "in", "out", "missed" (a missed clock-out closed without a time).

function validRecord(r) {
  if (!r || typeof r !== "object") return "Bad record.";
  if (!r.id || typeof r.id !== "string") return "Record needs an id.";
  if (!r.teacherName || typeof r.teacherName !== "string") return "Record needs a teacher name.";
  if (!["in", "out", "missed"].includes(r.type)) return "Record type must be in, out, or missed.";
  if (!r.ts || Number.isNaN(new Date(r.ts).getTime())) return "Record needs a valid time.";
  return null;
}

async function listRecords(store) {
  const out = [];
  let cursor;
  do {
    const page = await store.list({ prefix: "rec_", cursor });
    for (const item of page.blobs || []) {
      const rec = await store.get(item.key, { type: "json" });
      if (rec) out.push(rec);
    }
    cursor = page.cursor;
  } while (cursor);

  // One-time migration: the old design kept one "records" array blob.
  // Move each punch into its own key, then drop the old blob.
  const legacy = await store.get("records", { type: "json" });
  if (Array.isArray(legacy) && legacy.length) {
    for (const rec of legacy) {
      if (rec && rec.id && !out.some((r) => r.id === rec.id)) {
        await store.setJSON("rec_" + rec.id, rec);
        out.push(rec);
      }
    }
    await store.delete("records");
  }

  out.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  return out;
}

export default async (req) => {
  const store = getStore("cmca-timeclock");

  if (req.method === "GET") {
    const records = await listRecords(store);
    return new Response(JSON.stringify(records), { headers: NO_CACHE });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Bad request." }, 400);
    }

    if (body.action === "delete") {
      if (!body.id) return json({ error: "Missing record id." }, 400);
      const existing = await store.get("rec_" + body.id, { type: "json" });
      if (!existing) return json({ error: "Record not found." }, 404);
      const admin = await isValidToken(store, req);
      if (!admin && !isRecentPunch(existing)) {
        return json({ error: "Admin sign-in required to delete this punch." }, 401);
      }
      await store.delete("rec_" + body.id);
      return json({ ok: true });
    }

    if (body.action === "update") {
      if (!(await isValidToken(store, req))) {
        return json({ error: "Admin sign-in required." }, 401);
      }
      if (!body.id || !body.patch || typeof body.patch !== "object") {
        return json({ error: "Missing record id or changes." }, 400);
      }
      const existing = await store.get("rec_" + body.id, { type: "json" });
      if (!existing) return json({ error: "Record not found." }, 404);
      const updated = { ...existing, ...body.patch, id: existing.id };
      const err = validRecord(updated);
      if (err) return json({ error: err }, 400);
      await store.setJSON("rec_" + body.id, updated);
      return json({ ok: true, record: updated });
    }

    // Default: append a single punch.
    const record = body.record || body;
    const err = validRecord(record);
    if (err) return json({ error: err }, 400);
    await store.setJSON("rec_" + record.id, record);
    return json({ ok: true, record });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/api/records" };
