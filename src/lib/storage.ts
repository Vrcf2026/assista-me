import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Extract storage object path from either a raw path or a legacy public URL.
export function extractStoragePath(bucket: string, urlOrPath: string): string {
  if (!urlOrPath) return urlOrPath;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = urlOrPath.indexOf(marker);
  if (idx >= 0) return urlOrPath.slice(idx + marker.length);
  const signedMarker = `/storage/v1/object/sign/${bucket}/`;
  const sidx = urlOrPath.indexOf(signedMarker);
  if (sidx >= 0) return urlOrPath.slice(sidx + signedMarker.length).split("?")[0];
  return urlOrPath;
}

export async function openPrivateFile(bucket: string, urlOrPath: string) {
  const path = extractStoragePath(bucket, urlOrPath);
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10);
  if (error || !data) {
    toast.error(error?.message ?? "Não foi possível abrir o ficheiro");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

export function useSignedUrl(bucket: string, urlOrPath: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancel = false;
    if (!urlOrPath) { setUrl(null); return; }
    const path = extractStoragePath(bucket, urlOrPath);
    supabase.storage.from(bucket).createSignedUrl(path, 60 * 60).then(({ data }) => {
      if (!cancel) setUrl(data?.signedUrl ?? null);
    });
    return () => { cancel = true; };
  }, [bucket, urlOrPath]);
  return url;
}
