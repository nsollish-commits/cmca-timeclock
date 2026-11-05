import { getStore } from "@netlify/blobs";
import { json, getPasscode, createToken } from "./lib/auth.js";

// POST /api/admin-login {pass} -> {ok:true, token} on success (token lasts 24h).
// The passcode is checked on the server. It is never sent to the browser,
// and it is never stored in the config blob anymore.

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const store = getStore("cmca-timeclock");
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request." }, 400);
  }
  const expected = await getPasscode(store);
  if ((body.pass || "") === expected && expected) {
    const token = await createToken(store);
    return json({ ok: true, token });
  }
  return json({ error: "Incorrect passcode." }, 401);
};

export const config = { path: "/api/admin-login" };
