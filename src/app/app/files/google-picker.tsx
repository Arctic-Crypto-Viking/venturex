"use client";

import { useState } from "react";
import { Button, Notice } from "@core/components/ui";
import type { CoreDict } from "@core/i18n";
import { indexPickedAction, pickerTokenAction } from "./actions";

type Words = CoreDict["files"]["sources"];

/**
 * Google's own Picker (docs/FILES.md F3): photos and videos, many at once, in
 * the person's Drive. Under the `drive.file` scope the app sees exactly what is
 * picked and nothing else, which is the honest deal for a Drive full of other
 * things. The token is the person's, fetched fresh from the server just for the
 * dialog; the picked ids go back to the server, which reads their details with
 * the token in Vault.
 */
export function GooglePicker({ sourceId, apiKey, appId, t }: { sourceId: string; apiKey: string; appId: string; t: Words }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function open() {
    setBusy(true); setMsg(null);
    try {
      const tok = await pickerTokenAction(sourceId);
      if ("error" in tok) throw new Error(tok.error);
      await loadPickerApi();
      const g = window.google!;
      const view = new g.picker.DocsView(g.picker.ViewId.DOCS_IMAGES_AND_VIDEOS);
      view.setIncludeFolders(true);
      view.setMode(g.picker.DocsViewMode.GRID);
      const picker = new g.picker.PickerBuilder()
        .setDeveloperKey(apiKey).setAppId(appId).setOAuthToken(tok.token)
        .addView(view).enableFeature(g.picker.Feature.MULTISELECT_ENABLED).enableFeature(g.picker.Feature.NAV_HIDDEN)
        .setCallback((data: PickerResponse) => { void onPicked(data); })
        .build();
      picker.setVisible(true);
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof Error ? e.message : "picker" });
      setBusy(false);
    }
  }

  async function onPicked(data: PickerResponse) {
    if (data.action === "cancel") { setBusy(false); return; }
    if (data.action !== "picked") return;
    const ids = (data.docs ?? []).map((d) => d.id).filter(Boolean);
    if (!ids.length) { setMsg({ tone: "danger", text: t.pickedNone }); setBusy(false); return; }
    const r = await indexPickedAction(sourceId, ids);
    setMsg(r.error ? { tone: "danger", text: r.error } : { tone: "success", text: t.picked.replace("{n}", String(r.items)) });
    setBusy(false);
    if (!r.error) setTimeout(() => window.location.reload(), 800);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="sm" variant="primary" disabled={busy} onClick={() => void open()}>{busy ? t.pickerBusy : t.pickFiles}</Button>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
    </div>
  );
}

type PickerResponse = { action: "picked" | "cancel" | "loaded"; docs?: Array<{ id: string; name?: string; mimeType?: string }> };
type GooglePickerNs = {
  picker: {
    DocsView: new (viewId?: unknown) => { setIncludeFolders: (b: boolean) => unknown; setMode: (m: unknown) => unknown };
    ViewId: { DOCS_IMAGES_AND_VIDEOS: unknown };
    DocsViewMode: { GRID: unknown };
    Feature: { MULTISELECT_ENABLED: unknown; NAV_HIDDEN: unknown };
    PickerBuilder: new () => {
      setDeveloperKey: (k: string) => PickerBuilderLike; setAppId: (id: string) => PickerBuilderLike; setOAuthToken: (t: string) => PickerBuilderLike;
      addView: (v: unknown) => PickerBuilderLike; enableFeature: (f: unknown) => PickerBuilderLike; setCallback: (cb: (d: PickerResponse) => void) => PickerBuilderLike;
      build: () => { setVisible: (b: boolean) => void };
    };
  };
};
type PickerBuilderLike = InstanceType<GooglePickerNs["picker"]["PickerBuilder"]>;
declare global {
  interface Window { google?: GooglePickerNs; gapi?: { load: (api: string, cb: () => void) => void } }
}

let loading: Promise<void> | null = null;
function loadPickerApi(): Promise<void> {
  if (window.google?.picker) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js";
    s.async = true;
    s.onload = () => { window.gapi?.load("picker", () => resolve()); };
    s.onerror = () => reject(new Error("Google's picker script did not load."));
    document.head.appendChild(s);
  });
  return loading;
}
