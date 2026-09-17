/**
 * Helper para enviar push notifications a partir de qualquer route server-side.
 * Chama /api/push/send internamente.
 */

const SITE_URL = "https://tickets.vrcf.info";

export async function sendPushToUser(params: {
  userId: string;
  title: string;
  body: string;
  link?: string;
  serviceKey: string;
}): Promise<void> {
  try {
    const secret = params.serviceKey.slice(0, 32);
    await fetch(`${SITE_URL}/api/push/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify({
        user_id: params.userId,
        title: params.title,
        body: params.body,
        link: params.link,
      }),
    });
  } catch {
    // Push é best-effort — não bloqueia o fluxo principal
  }
}

export async function sendPushToAdmins(params: {
  title: string;
  body: string;
  link?: string;
  serviceKey: string;
}): Promise<void> {
  try {
    const secret = params.serviceKey.slice(0, 32);
    await fetch(`${SITE_URL}/api/push/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify({
        title: params.title,
        body: params.body,
        link: params.link,
      }),
    });
  } catch {
    // Best-effort
  }
}
