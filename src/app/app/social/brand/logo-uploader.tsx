"use client";

import { useRef, useState } from "react";
import { createClient } from "@core/lib/supabase/client";
import { Button, Notice } from "@core/components/ui";
import { setBrandLogoAction } from "../actions";

/**
 * The Brand kit page's logo upload (the guide's "set up your brand kit" step).
 * Resizes on the device to a 640 px PNG (transparency kept), uploads straight from
 * the browser to the bucket and path the product named (RLS scopes the folder to
 * the account), then the server records the URL as the actor's logo of record.
 */
export function BrandLogoUploader({ bucket, path, hasLogo, labels }: {
  bucket: string;
  /** the object path for this upload, already scoped to account and actor */
  path: string;
  hasLogo: boolean;
  labels: { add: string; replace: string; busy: string; failed: string };
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const blob = await resizePng(file, 640);
      const supabase = createClient();
      const { error: upErr } = await supabase.storage.from(bucket).upload(path, blob, { contentType: "image/png", upsert: true, cacheControl: "31536000" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      const res = await setBrandLogoAction(data.publicUrl);
      if (res.error) throw new Error(res.error);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.failed);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/*" className="sr-only" onChange={(e) => onPick(e.target.files?.[0])} />
      <Button type="button" size="sm" variant={hasLogo ? "secondary" : "primary"} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? labels.busy : hasLogo ? labels.replace : labels.add}
      </Button>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}

async function resizePng(file: File, max: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // the browser can't decode it (SVG in some browsers, HEIC): send as is, the bucket limits size and type
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/png", 0.92));
}
