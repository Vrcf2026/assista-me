import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

// Chave pública VAPID — gerada uma vez, pública e segura no bundle
const VAPID_PUBLIC_KEY = "BPHH73SyLZAGxPPPQNUaHZ7AMN4ZckHRZ8khcpeWURWPJDz7l2-fdDlR5vFNPnc0v_N0MLuSq69TKVUGqVLzC8E";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export type PushStatus = "unsupported" | "denied" | "granted" | "default" | "loading";

export function usePushNotifications() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushStatus>("loading");
  const [swReady, setSwReady] = useState(false);

  // Registar Service Worker
  useEffect(() => {
    if (!("serviceWorker" in navigator)) { setStatus("unsupported"); return; }
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        setSwReady(true);
        // Actualizar estado com a permissão actual
        if (Notification.permission === "granted") setStatus("granted");
        else if (Notification.permission === "denied") setStatus("denied");
        else setStatus("default");
        return reg;
      })
      .catch(() => setStatus("unsupported"));
  }, []);

  // Guardar subscrição no Supabase
  const saveSubscription = useCallback(async (sub: PushSubscription) => {
    if (!user) return;
    const json = sub.toJSON();
    await supabase.from("push_subscriptions" as any).upsert({
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh: (json.keys as any)?.p256dh ?? "",
      auth: (json.keys as any)?.auth ?? "",
      user_agent: navigator.userAgent.slice(0, 200),
      updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });
  }, [user]);

  // Pedir permissão e subscrever
  const subscribe = useCallback(async () => {
    if (!swReady || !user) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setStatus("denied"); return; }

      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as string,
      });

      await saveSubscription(sub);
      setStatus("granted");
      toast.success("Notificações push activadas!");
    } catch (e) {
      console.error("Push subscribe error:", e);
      toast.error("Não foi possível activar as notificações");
    }
  }, [swReady, user, saveSubscription]);

  // Cancelar subscrição
  const unsubscribe = useCallback(async () => {
    if (!user) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      await supabase.from("push_subscriptions" as any)
        .delete().eq("endpoint", sub.endpoint);
    }
    setStatus("default");
    toast.info("Notificações push desactivadas");
  }, [user]);

  return { status, subscribe, unsubscribe, swReady };
}
