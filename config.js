import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore("cmca-timeclock");
  const noCacheHeaders = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
  };

  if (req.method === "GET") {
    const data = await store.get("config", { type: "json" });
    return new Response(JSON.stringify(data || null), {
      headers: noCacheHeaders
    });
  }

  if (req.method === "POST") {
    const body = await req.json();
    await store.setJSON("config", body);
    return new Response(JSON.stringify({ ok: true }), {
      headers: noCacheHeaders
    });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/api/config" };
