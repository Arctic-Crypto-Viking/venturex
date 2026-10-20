"use client";

import { useRef, useState } from "react";
import { createClient } from "@core/lib/supabase/client";
import { Button, Input, Notice, fieldRow } from "@core/components/ui";
import type { CoreDict } from "@core/i18n";
import { registerUploadAction, uploadTargetAction } from "./actions";

type Words = CoreDict["files"]["upload"];
const IMAGE_MAX = 2400;

/**
 * Many files at once, straight from the device into the account's folder of
 * the private `library` bucket (RLS lets a member write there and nowhere
 * else). A photo wider than 2400 px is resized on the device first (a phone
 * photo becomes ~1 MB and is still far above Instagram's 1080); a video goes
 * as it is. Each file is then recorded by the server; the worker makes the
 * thumbnail within the minute.
 */
export function Uploader({ t }: { t: Words }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [done, setDone] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [album, setAlbum] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErrors([]); setDone(0); setBusy(files.length);
    const supabase = createClient();
    let ok = 0;
    for (const file of Array.from(files)) {
      try {
        const isImage = file.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name);
        const prepared = isImage ? await shrink(file) : { blob: file as Blob, type: file.type || null, width: null, height: null, ext: (file.name.split(".").pop() ?? "bin").toLowerCase() };
        const target = await uploadTargetAction(prepared.ext);
        const { error } = await supabase.storage.from(target.bucket).upload(target.path, prepared.blob, { contentType: prepared.type ?? undefined, upsert: false, cacheControl: "3600" });
        if (error) throw error;
        const res = await registerUploadAction({ path: target.path, name: file.name, mime: prepared.type, bytes: prepared.blob.size, width: prepared.width, height: prepared.height, album });
        if (!res.ok) throw new Error(res.error);
        ok++; setDone(ok);
      } catch (e) {
        setErrors((prev) => [...prev, `${t.failed.replace("{name}", file.name)}${e instanceof Error && e.message ? ` (${e.message})` : ""}`]);
      } finally {
        setBusy((n) => (n === null ? null : n - 1));
      }
    }
    setBusy(null);
    if (ok) window.location.reload();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={fieldRow.pair}>
        <Input value={album} onChange={(e) => setAlbum(e.target.value)} placeholder={t.album} aria-label={t.album} maxLength={200} />
        <Button type="button" size="md" disabled={busy !== null} onClick={() => input.current?.click()}>
          {busy !== null ? t.busy.replace("{n}", String(busy)) : t.button}
        </Button>
      </div>
      <input ref={input} type="file" multiple accept="image/*,video/mp4,video/quicktime,.heic,.heif,.mov,.mp4" className="sr-only" onChange={(e) => { void onPick(e.target.files); e.target.value = ""; }} />
      <p className="text-xs text-muted">{t.hint} {t.albumHint}</p>
      {done > 0 && busy === null ? <Notice tone="success">{t.done.replace("{n}", String(done))}</Notice> : null}
      {errors.map((e) => <Notice key={e} tone="danger">{e}</Notice>)}
    </div>
  );
}

async function shrink(file: File): Promise<{ blob: Blob; type: string | null; width: number | null; height: number | null; ext: string }> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return { blob: file, type: file.type || null, width: null, height: null, ext: (file.name.split(".").pop() ?? "jpg").toLowerCase() };
  const scale = Math.min(1, IMAGE_MAX / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp")) {
    return { blob: file, type: file.type, width: bitmap.width, height: bitmap.height, ext: file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg" };
  }
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { blob: file, type: file.type || null, width: bitmap.width, height: bitmap.height, ext: "jpg" };
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.9));
  return { blob, type: "image/jpeg", width: w, height: h, ext: "jpg" };
}
