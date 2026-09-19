import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Envia push notifications via Web Push Protocol nativo (sem web-push npm).
 * Compatível com Cloudflare Workers Edge Runtime.
 *
 * Variáveis de ambiente:
 *   VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_EMAIL
 */

export const Route = createFileRoute("/api/push/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
        const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ??
          "BPHH73SyLZAGxPPPQNUaHZ7AMN4ZckHRZ8khcpeWURWPJDz7l2-fdDlR5vFNPnc0v_N0MLuSq69TKVUGqVLzC8E";
        const VAPID_EMAIL = process.env.VAPID_EMAIL ?? "mailto:vrcf.loja@gmail.com";

        if (!VAPID_PRIVATE) {
          return Response.json({ error: "VAPID_PRIVATE_KEY não configurada" }, { status: 500 });
        }

        const authHeader = request.headers.get("x-internal-secret");
        const SERVICE_SECRET = SERVICE_KEY.slice(0, 32);
        if (authHeader !== SERVICE_SECRET) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json() as {
          user_id?: string;
          title: string;
          body: string;
          link?: string;
        };

        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

        let query = supabase.from("push_subscriptions" as any).select("*");
        if (body.user_id) query = query.eq("user_id", body.user_id);
        const { data: subs } = await query;
        if (!subs?.length) return Response.json({ ok: true, sent: 0 });

        const payload = JSON.stringify({
          title: body.title,
          body: body.body,
          link: body.link ?? "/",
        });

        // Enviar via Web Push Protocol nativo (edge-compatible)
        let sent = 0;
        let failed = 0;

        await Promise.allSettled(
          subs.map(async (sub: any) => {
            try {
              const result = await sendWebPush({
                endpoint: sub.endpoint,
                p256dh: sub.p256dh,
                auth: sub.auth,
                payload,
                vapidPublic: VAPID_PUBLIC,
                vapidPrivate: VAPID_PRIVATE!,
                vapidEmail: VAPID_EMAIL,
              });
              if (result === 410) {
                // Subscrição expirada
                await supabase.from("push_subscriptions" as any)
                  .delete().eq("endpoint", sub.endpoint);
                failed++;
              } else {
                sent++;
              }
            } catch {
              failed++;
            }
          })
        );

        return Response.json({ ok: true, sent, failed });
      },
    },
  },
});

// ── Web Push Protocol nativo — sem dependências Node.js ──────────────────────

async function sendWebPush(params: {
  endpoint: string;
  p256dh: string;
  auth: string;
  payload: string;
  vapidPublic: string;
  vapidPrivate: string;
  vapidEmail: string;
}): Promise<number> {
  const { endpoint, p256dh, auth, payload, vapidPublic, vapidPrivate, vapidEmail } = params;

  // Gerar VAPID JWT usando Web Crypto API (disponível em Edge)
  const vapidToken = await generateVapidToken(endpoint, vapidPrivate, vapidEmail);
  const authHeader = `vapid t=${vapidToken},k=${vapidPublic}`;

  // Encriptar payload com ECDH + AES-GCM
  const encrypted = await encryptPayload(payload, p256dh, auth);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "TTL": "86400",
    },
    body: encrypted,
  });

  return res.status;
}

async function generateVapidToken(
  endpoint: string,
  privateKeyB64: string,
  email: string,
): Promise<string> {
  const audience = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;

  const header = b64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64url(JSON.stringify({ aud: audience, exp, sub: email }));
  const sigInput = `${header}.${claims}`;

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKeyB64),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(sigInput),
  );

  return `${sigInput}.${arrayToB64url(new Uint8Array(sig))}`;
}

async function encryptPayload(
  payload: string,
  p256dhB64: string,
  authB64: string,
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(payload);
  const authBytes = base64urlToBytes(authB64);

  // Chave pública do cliente (receiver)
  const receiverPublicKey = await crypto.subtle.importKey(
    "raw",
    base64urlToBytes(p256dhB64).buffer as ArrayBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );

  // Gerar chave efémera do servidor
  const senderKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  const senderPublicKeyRaw = await crypto.subtle.exportKey("raw", senderKeyPair.publicKey);

  // ECDH shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: receiverPublicKey },
    senderKeyPair.privateKey,
    256,
  );

  // Salt aleatório
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF para derivar a chave de conteúdo
  const prk = await hkdf(new Uint8Array(sharedSecret), authBytes, encoder.encode("Content-Encoding: auth\0"), 32);
  const key = await hkdf(prk, salt, buildInfo("aesgcm", new Uint8Array(senderPublicKeyRaw), base64urlToBytes(p256dhB64)), 16);
  const nonce = await hkdf(prk, salt, buildInfo("nonce", new Uint8Array(senderPublicKeyRaw), base64urlToBytes(p256dhB64)), 12);

  const aesKey = await crypto.subtle.importKey("raw", key.buffer as ArrayBuffer, { name: "AES-GCM" }, false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce.buffer as ArrayBuffer }, aesKey, payloadBytes.buffer as ArrayBuffer);

  // Montar pacote aes128gcm
  const senderPublic = new Uint8Array(senderPublicKeyRaw);
  const result = new Uint8Array(16 + 4 + 1 + senderPublic.length + encrypted.byteLength);
  result.set(salt, 0);
  new DataView(result.buffer).setUint32(16, 4096, false);
  result[20] = senderPublic.length;
  result.set(senderPublic, 21);
  result.set(new Uint8Array(encrypted), 21 + senderPublic.length);
  return result.buffer;
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm.buffer as ArrayBuffer, { name: "HKDF" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt.buffer as ArrayBuffer, info: info.buffer as ArrayBuffer }, key, length * 8);
  return new Uint8Array(bits);
}

function buildInfo(type: string, clientPublic: Uint8Array, serverPublic: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const typeBytes = encoder.encode(`Content-Encoding: ${type}\0P-256\0`);
  const result = new Uint8Array(typeBytes.length + 2 + clientPublic.length + 2 + serverPublic.length);
  result.set(typeBytes);
  let offset = typeBytes.length;
  new DataView(result.buffer).setUint16(offset, clientPublic.length, false); offset += 2;
  result.set(clientPublic, offset); offset += clientPublic.length;
  new DataView(result.buffer).setUint16(offset, serverPublic.length, false); offset += 2;
  result.set(serverPublic, offset);
  return result;
}

function b64url(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function arrayToB64url(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlToBytes(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - b64.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

function pemToDer(b64: string): ArrayBuffer {
  // Aceita base64url raw ou PEM
  const clean = b64.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const padded = clean.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - clean.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
