"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { createClient } from "@core/lib/supabase/client";
import { Button, Choice, Field, Input, Notice, Select, Textarea, cx, fieldRow } from "@core/components/ui";
import type { CoreDict } from "@core/i18n";
import type { SocialGig } from "@core/product";
import type { Template } from "@core/lib/social/db";
import type { MediaItem, PostFormat, UserTag } from "@core/lib/social/types";
import { createPostAction, updatePostAction, type ComposeState } from "../actions";

type Words = CoreDict["social"]["compose"];
type Tpl = Omit<Template, "layout">;
type Source = "template" | "upload" | "video";
const IMAGE_FORMATS: PostFormat[] = ["feed_4x5", "story_9x16"];
const VIDEO_FORMATS: PostFormat[] = ["reel_9x16", "story_9x16"];
const MIN_AHEAD_MIN = 5;
const DEFAULT_AHEAD_MIN = 10;
const PREVIEW_DELAY_MS = 450;
const HANDLE = /^[a-z0-9._]{1,30}$/i;
/** The frame each format is drawn in: the tiles, the preview. */
const ASPECT: Record<PostFormat, string> = {
  feed_4x5: "aspect-[4/5]", square: "aspect-square", story_9x16: "aspect-[9/16]", reel_9x16: "aspect-[9/16]", reel_cover: "aspect-[9/16]", carousel_page: "aspect-[4/5]",
};

/** What an existing draft brings into the editor (the check-and-edit step). */
export type PostInitial = {
  id: string; connectionId: string; format: PostFormat; kind: "image" | "video"; templateId: string | null;
  slots: Record<string, string>; media: MediaItem[]; caption: string; firstComment: string; altText: string;
  link: string; userTags: UserTag[]; collaborators: string[];
  /** the ISO instant; the browser turns it into its own zone's wall time */
  scheduledFor: string;
  /** where to go after the save (a plan's screen); the review step otherwise */
  returnTo?: string | null;
};

/**
 * The post editor. One screen on a phone: where to post, the picture (template
 * with its slots, a photo, or a video for a reel or a story, uploaded straight
 * from the device into the account's folder of the `social` bucket), the words,
 * the link, the people tagged, the time (a native date-and-time picker in the
 * person's own zone, sent with that zone's name). With `initial` it edits a
 * draft: the same fields, prefilled.
 *
 * The preview (20 Oct 2026) sits beside the fields from md up and under the
 * picture choices on a phone: a template is drawn by /api/social/preview with
 * the words typed so far, a photo or video is shown cropped to the format. On
 * a picture, tapping the preview places the person being tagged.
 *
 * Every field is controlled by React state. A form submitted through a server
 * action is reset by React when the action returns, and on a phone that looked
 * like "the form forgot everything" whenever the server answered with a check
 * (a time too close, a missing template). State survives the reset; the answer
 * shows under the button and the person corrects one field.
 */
export function PostForm({ t, accountId, connections, templates, gigs, defaultHashtags, initial }: {
  t: Words; accountId: string; connections: Array<{ id: string; label: string }>; templates: Tpl[]; gigs: SocialGig[]; defaultHashtags: string; initial?: PostInitial;
}) {
  const [state, formAction, pending] = useActionState(initial ? updatePostAction : createPostAction, undefined as ComposeState);
  const initialSource: Source = initial ? (initial.kind === "video" ? "video" : initial.templateId ? "template" : "upload") : "template";
  const [source, setSource] = useState<Source>(initialSource);
  const [format, setFormat] = useState<PostFormat>(initial?.format ?? "feed_4x5");
  const formats = source === "video" ? VIDEO_FORMATS : IMAGE_FORMATS;
  const effectiveFormat = formats.includes(format) ? format : formats[0];
  const available = useMemo(() => templates.filter((x) => x.format === effectiveFormat), [templates, effectiveFormat]);
  const covers = useMemo(() => templates.filter((x) => x.format === "reel_cover"), [templates]);
  const [templateId, setTemplateId] = useState<string>(initial?.templateId ?? "");
  const template = available.find((x) => x.id === templateId) ?? available[0] ?? null;
  const [account, setAccount] = useState(initial?.connectionId ?? connections[0]?.id ?? "");
  const [slots, setSlots] = useState<Record<string, string>>(initial?.slots ?? {});
  const [coverSlots, setCoverSlots] = useState<Record<string, string>>({});
  const [caption, setCaption] = useState(initial?.caption ?? "");
  const [firstComment, setFirstComment] = useState(initial ? initial.firstComment : defaultHashtags);
  const [altText, setAltText] = useState(initial?.altText ?? "");
  const [link, setLink] = useState(initial?.link ?? "");
  const [tags, setTags] = useState<UserTag[]>(initial?.userTags ?? []);
  const [placing, setPlacing] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState((initial?.collaborators ?? []).map((c) => `@${c}`).join(" "));
  const [coverMode, setCoverMode] = useState<"none" | "template" | "photo">(initial?.media.some((m) => m.kind === "image") && initial.kind === "video" ? "photo" : "none");
  // the time: wall time in the browser's zone. The default and the minimum come from
  // the person's clock, which the server does not have, so they exist only once the
  // browser owns the markup (mounted); until then the field is empty, as on the server.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [opened] = useState(() => Date.now()); // the clock once, when the editor opened
  const [whenTyped, setWhen] = useState(initial ? localValue(new Date(initial.scheduledFor)) : "");
  const when = whenTyped || (mounted ? localValue(new Date(opened + DEFAULT_AHEAD_MIN * 60_000)) : "");
  const minWhen = mounted ? localValue(new Date(opened + MIN_AHEAD_MIN * 60_000)) : "";
  const tz = mounted ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  // a typed time under five minutes ahead is what the server will move: say so here already
  const tooClose = mounted && !!when && !!minWhen && when < minWhen;
  const whenWords = useMemo(() => words(tooClose ? minWhen : when), [when, tooClose, minWhen]);
  const isStory = effectiveFormat === "story_9x16";
  const isReel = effectiveFormat === "reel_9x16";
  const existingImage = initial?.media.find((m) => m.kind === "image")?.url ?? "";
  const existingVideo = initial?.media.find((m) => m.kind === "video")?.url ?? "";
  const slot = (k: string) => slots[k] ?? "";
  const setSlot = (k: string, v: string) => setSlots((s) => ({ ...s, [k]: v }));

  // the picture the preview shows: a fresh render of the template, or the upload itself
  const templateValues = useMemo(() => (template ? Object.fromEntries(template.slots.map((s) => [s, slots[s] ?? ""])) : {}), [template, slots]);
  const rendered = useTemplatePreview(source === "template" ? template?.id ?? null : null, templateValues);
  const photo = source === "upload" ? slot("upload_url") || existingImage : "";
  const video = source === "video" ? slot("video_url") || existingVideo : "";
  const poster = source === "video" ? slot("cover_url") || (coverMode === "photo" ? existingImage : "") : "";
  // a picture places its tags; a reel lists names only (Instagram takes no position there)
  const placeable = !(source === "video" && isReel);

  function addTag(raw: string) {
    const username = raw.trim().replace(/^@+/, "");
    if (!HANDLE.test(username) || tags.some((x) => x.username.toLowerCase() === username.toLowerCase()) || tags.length >= 20) return false;
    setTags((list) => [...list, { username }]);
    if (placeable) setPlacing(username);
    return true;
  }
  function place(x: number, y: number) {
    if (!placing || !placeable) return;
    setTags((list) => list.map((u) => (u.username === placing ? { ...u, x, y } : u)));
    setPlacing(null);
  }

  const preview = (
    <Preview
      t={t} format={effectiveFormat} source={source} rendered={rendered} photo={photo} video={video} poster={poster}
      tags={placeable ? tags : []} placing={placeable ? placing : null} onPlace={place}
    />
  );

  return (
    <form action={formAction} className="grid gap-6 md:grid-cols-[minmax(0,1fr)_240px] md:items-start">
      <div className="flex min-w-0 flex-col gap-5">
        <input type="hidden" name="tz" value={tz} />
        <input type="hidden" name="source" value={source} />
        <input type="hidden" name="format" value={effectiveFormat} />
        <input type="hidden" name="user_tags" value={JSON.stringify(tags)} />
        {initial ? <input type="hidden" name="post" value={initial.id} /> : null}
        {initial?.returnTo ? <input type="hidden" name="return" value={initial.returnTo} /> : null}
        {connections.length === 1 ? <input type="hidden" name="account" value={connections[0].id} /> : (
          <Field label={t.account}>
            <Select name="account" value={account} onChange={(e) => setAccount(e.target.value)}>{connections.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
          </Field>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">{t.source}</legend>
          <Choice type="radio" name="source_choice" value="template" checked={source === "template"} onChange={() => setSource("template")} label={t.fromTemplate} />
          <Choice type="radio" name="source_choice" value="upload" checked={source === "upload"} onChange={() => setSource("upload")} label={t.fromUpload} hint={t.uploadHint} />
          <Choice type="radio" name="source_choice" value="video" checked={source === "video"} onChange={() => setSource("video")} label={t.fromVideo} hint={t.uploadVideoHint} />
        </fieldset>

        <FormatTiles t={t} formats={formats} value={effectiveFormat} onChange={setFormat} />

        {source === "template" ? (
          <>
            <Field label={t.template}>
              <Select name="template" value={template?.id ?? ""} onChange={(e) => setTemplateId(e.target.value)}>
                {available.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </Field>
            <div className="md:hidden">{preview}</div>
            {template?.slots.filter((s) => s !== "photo").map((s) => s === "venue" && gigs.length ? (
              <VenueField key={s} t={t} gigs={gigs} slots={template.slots} value={slot("venue")} onPick={(values) => setSlots((cur) => ({ ...cur, ...values }))} />
            ) : (
              <Field key={s} label={t.slots[s as keyof Words["slots"]] ?? s}>
                {s === "text" || s === "title" || s === "lineup"
                  ? <Textarea name={`slot_${s}`} rows={s === "lineup" ? 4 : 2} maxLength={s === "lineup" ? 600 : 200} required value={slot(s)} onChange={(e) => setSlot(s, e.target.value)} />
                  : <Input name={`slot_${s}`} maxLength={200} value={slot(s)} onChange={(e) => setSlot(s, e.target.value)} />}
              </Field>
            ))}
            {template?.slots.includes("photo") ? <UploadField name="slot_photo" accountId={accountId} t={t} hint={t.photoOptional} value={slot("photo")} onChange={(u) => setSlot("photo", u)} /> : null}
          </>
        ) : source === "upload" ? (
          <>
            <UploadField name="upload_url" accountId={accountId} t={t} required value={slot("upload_url") || existingImage} onChange={(u) => setSlot("upload_url", u)} />
            <div className="md:hidden">{preview}</div>
          </>
        ) : (
          <>
            <UploadField name="video_url" accountId={accountId} t={t} required video value={slot("video_url") || existingVideo} onChange={(u) => setSlot("video_url", u)} />
            {isReel ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-sm font-medium">{t.cover}</legend>
                <input type="hidden" name="cover_mode" value={coverMode} />
                <p className="text-xs text-muted">{t.coverHint}</p>
                <div className={fieldRow[3]}>
                  <Choice type="radio" name="cover_choice" value="none" checked={coverMode === "none"} onChange={() => setCoverMode("none")} label="—" />
                  <Choice type="radio" name="cover_choice" value="template" checked={coverMode === "template"} onChange={() => setCoverMode("template")} label={t.fromTemplate} />
                  <Choice type="radio" name="cover_choice" value="photo" checked={coverMode === "photo"} onChange={() => setCoverMode("photo")} label={t.fromUpload} />
                </div>
                {coverMode === "template" && covers[0] ? (
                  <>
                    <input type="hidden" name="cover_template" value={covers[0].id} />
                    {covers[0].slots.map((s) => (
                      <Field key={s} label={t.slots[s as keyof Words["slots"]] ?? s}>
                        <Input name={`cover_slot_${s}`} maxLength={200} required value={coverSlots[s] ?? ""} onChange={(e) => setCoverSlots((c) => ({ ...c, [s]: e.target.value }))} />
                      </Field>
                    ))}
                  </>
                ) : null}
                {coverMode === "photo" ? <UploadField name="cover_url" accountId={accountId} t={t} required value={slot("cover_url") || existingImage} onChange={(u) => setSlot("cover_url", u)} /> : null}
              </fieldset>
            ) : null}
            <div className="md:hidden">{preview}</div>
          </>
        )}

        {!isStory ? <Field label={t.caption} hint={t.captionHint}><Textarea name="caption" rows={4} maxLength={2200} value={caption} onChange={(e) => setCaption(e.target.value)} /></Field> : null}
        {!isStory ? <Field label={t.firstComment} hint={t.firstCommentHint}><Textarea name="first_comment" rows={2} maxLength={2200} value={firstComment} onChange={(e) => setFirstComment(e.target.value)} /></Field> : null}
        {!isStory && source !== "video" ? <Field label={t.altText} hint={t.altTextHint}><Input name="alt_text" maxLength={1000} value={altText} onChange={(e) => setAltText(e.target.value)} /></Field> : null}

        <Field label={t.link} hint={isStory ? t.linkStoryHint : t.linkHint}>
          <Input name="link" inputMode="url" autoComplete="url" placeholder="https://" maxLength={500} value={link} onChange={(e) => setLink(e.target.value)} />
        </Field>

        <TagsField t={t} tags={tags} placeable={placeable} placing={placing} onAdd={addTag} onPlace={setPlacing}
          onRemove={(u) => { setTags((list) => list.filter((x) => x.username !== u)); if (placing === u) setPlacing(null); }} />

        {!isStory ? (
          <Field label={t.collaborators} hint={t.collaboratorsHint}>
            <Input name="collaborators" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="@name" maxLength={120} value={collaborators} onChange={(e) => setCollaborators(e.target.value)} />
          </Field>
        ) : null}

        <div className={fieldRow[2]}>
          <Field label={t.when} hint={whenWords ? `${t.goesOut} ${whenWords}${tooClose ? ` · ${t.movedHint}` : ""}` : t.whenHint}>
            <Input name="when" type="datetime-local" required value={when} step={60} onChange={(e) => setWhen(e.target.value)} suppressHydrationWarning />
          </Field>
        </div>
        {initial ? <p className="text-xs text-muted">{t.previewNote}</p> : null}
        {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}
        <Button type="submit" size="lg" disabled={pending}>{pending ? (initial ? t.updating : t.making) : (initial ? t.update : t.makeIt)}</Button>
      </div>
      <aside className="hidden md:sticky md:top-32 md:block">{preview}</aside>
    </form>
  );
}

/**
 * The template drawn with the words so far (POST /api/social/preview), shortly
 * after the last keystroke; an older answer never replaces a newer one.
 */
function useTemplatePreview(templateId: string | null, values: Record<string, string>): { url: string; state: "idle" | "loading" | "ready" | "failed" } {
  const [out, setOut] = useState<{ url: string; state: "idle" | "loading" | "ready" | "failed" }>({ url: "", state: "idle" });
  const last = useRef("");
  const key = templateId ? JSON.stringify([templateId, values]) : "";
  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setOut((o) => ({ ...o, state: "loading" }));
      try {
        const [template, slots] = JSON.parse(key) as [string, Record<string, string>];
        const res = await fetch("/api/social/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ template, slots }), signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const url = URL.createObjectURL(await res.blob());
        if (last.current) URL.revokeObjectURL(last.current);
        last.current = url;
        setOut({ url, state: "ready" });
      } catch {
        if (!ctrl.signal.aborted) setOut((o) => ({ ...o, state: "failed" }));
      }
    }, PREVIEW_DELAY_MS);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [key]);
  return templateId ? out : { url: "", state: "idle" };
}

/** The post as it will look, in its format's frame. On a picture, a tap places the person being tagged. */
function Preview({ t, format, source, rendered, photo, video, poster, tags, placing, onPlace }: {
  t: Words; format: PostFormat; source: Source; rendered: { url: string; state: string }; photo: string; video: string; poster: string;
  tags: UserTag[]; placing: string | null; onPlace: (x: number, y: number) => void;
}) {
  const picture = source === "template" ? rendered.url : source === "upload" ? photo : "";
  function tap(e: MouseEvent<HTMLDivElement>) {
    if (!placing) return;
    const r = e.currentTarget.getBoundingClientRect();
    onPlace(Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000, Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000);
  }
  return (
    <div className="mx-auto flex w-full max-w-[240px] flex-col gap-2">
      <p className="text-sm font-medium">{t.preview}</p>
      <div
        className={cx("relative w-full overflow-hidden rounded-2xl border border-border bg-surface-2", ASPECT[format], placing && "cursor-crosshair ring-2 ring-accent")}
        onClick={tap}
      >
        {source === "video" && video ? (
          <video src={video} poster={poster || undefined} muted playsInline controls className="absolute inset-0 h-full w-full object-cover" />
        ) : picture ? (
          // the preview is a blob or the upload's public URL: next/image adds nothing here
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picture} alt="" className={cx("absolute inset-0 h-full w-full object-cover transition-opacity", rendered.state === "loading" && source === "template" && "opacity-60")} />
        ) : (
          <div className="absolute inset-0 grid place-items-center p-4 text-center text-xs text-muted">{source === "template" ? t.previewEmpty : t.upload}</div>
        )}
        {tags.filter((u) => u.x != null && u.y != null).map((u) => (
          <span key={u.username} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] text-white" style={{ left: `${u.x! * 100}%`, top: `${u.y! * 100}%` }}>
            @{u.username}
          </span>
        ))}
      </div>
      {source === "template" && rendered.state === "loading" ? <p className="text-xs text-muted">{t.previewLoading}</p> : null}
      {source === "template" && rendered.state === "failed" ? <p className="text-xs text-danger">{t.previewFailed}</p> : null}
      {placing ? <p className="text-xs font-medium text-accent">{t.tagPlace.replace("{name}", placing)}</p> : null}
    </div>
  );
}

/** Format as pictures: each tile is drawn in the shape the post will have. */
function FormatTiles({ t, formats, value, onChange }: { t: Words; formats: PostFormat[]; value: PostFormat; onChange: (f: PostFormat) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">{t.format}</legend>
      <div className="grid grid-cols-2 gap-3">
        {formats.map((f) => (
          <label key={f} className={cx("flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors", value === f ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-border-strong")}>
            <input type="radio" name="format_choice" value={f} checked={value === f} onChange={() => onChange(f)} className="sr-only" />
            <span className={cx("block w-9 shrink-0 rounded-md border-2", ASPECT[f], value === f ? "border-accent bg-accent/20" : "border-border-strong bg-surface-2")} aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{t.formats[f]}</span>
              {t.formatNotes[f] ? <span className="block text-xs text-muted">{t.formatNotes[f]}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Venue: one of the name's gigs (it fills the template's venue, city, date and
 * time) or a new one, typed. A draft whose venue matches no gig opens on "new".
 */
function VenueField({ t, gigs, slots, value, onPick }: { t: Words; gigs: SocialGig[]; slots: string[]; value: string; onPick: (values: Record<string, string>) => void }) {
  const match = gigs.find((g) => g.venue === value);
  const [choice, setChoice] = useState<string>(match ? match.id : value ? "new" : "");
  const coming = gigs.filter((g) => g.upcoming);
  const before = gigs.filter((g) => !g.upcoming);
  const day = (iso: string) => new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00`));
  function pick(id: string) {
    setChoice(id);
    const g = gigs.find((x) => x.id === id);
    if (!g) { if (id === "new") onPick({ venue: "" }); return; }
    const out: Record<string, string> = { venue: g.venue };
    if (slots.includes("city") && g.city) out.city = g.city;
    if (g.upcoming && slots.includes("date")) out.date = day(g.date);
    if (g.upcoming && slots.includes("time") && g.time) out.time = g.time;
    onPick(out);
  }
  return (
    <div className="flex flex-col gap-2">
      <Field label={t.venuePick}>
        <Select value={choice} onChange={(e) => pick(e.target.value)}>
          <option value="" disabled>—</option>
          {coming.length ? <optgroup label={t.venueComing}>{coming.map((g) => <option key={g.id} value={g.id}>{day(g.date)} · {g.venue}{g.city && g.city !== g.venue ? `, ${g.city}` : ""}{g.title && g.title !== g.venue ? ` — ${g.title}` : ""}</option>)}</optgroup> : null}
          {before.length ? <optgroup label={t.venueBefore}>{before.map((g) => <option key={g.id} value={g.id}>{g.venue}{g.city ? `, ${g.city}` : ""}</option>)}</optgroup> : null}
          <option value="new">{t.venueNew}</option>
        </Select>
      </Field>
      {choice === "new" ? (
        <Input name="slot_venue" aria-label={t.venueTyped} placeholder={t.venueTyped} maxLength={200} value={value} onChange={(e) => onPick({ venue: e.target.value })} autoFocus />
      ) : (
        <input type="hidden" name="slot_venue" value={value} />
      )}
    </div>
  );
}

/** Tag people: a username, Add; on a picture the new tag waits for a tap on the preview. */
function TagsField({ t, tags, placeable, placing, onAdd, onRemove, onPlace }: {
  t: Words; tags: UserTag[]; placeable: boolean; placing: string | null; onAdd: (u: string) => boolean; onRemove: (u: string) => void; onPlace: (u: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const add = () => { if (onAdd(typed)) setTyped(""); };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{t.tags}</span>
      <div className="flex gap-2">
        <Input aria-label={t.tags} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="@name" maxLength={31} value={typed}
          onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button type="button" variant="secondary" onClick={add} disabled={!HANDLE.test(typed.trim().replace(/^@+/, ""))}>{t.tagAdd}</Button>
      </div>
      {tags.length ? (
        <ul className="flex flex-wrap gap-2">
          {tags.map((u) => (
            <li key={u.username} className={cx("flex items-center gap-1 rounded-full border px-3 py-1 text-sm", placing === u.username ? "border-accent text-accent" : "border-border")}>
              {placeable ? (
                <button type="button" onClick={() => onPlace(u.username)} className="underline-offset-4 hover:underline">@{u.username}</button>
              ) : <span>@{u.username}</span>}
              <button type="button" onClick={() => onRemove(u.username)} aria-label={`${t.tagRemove} @${u.username}`} className="ml-1 text-muted hover:text-fg">×</button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted">{placeable ? t.tagsHint : t.tagsReelHint}</p>
    </div>
  );
}

/** A Date → "YYYY-MM-DDTHH:mm" in the browser's zone (datetime-local's value). */
function localValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "2026-10-20T08:40" → "Tuesday 20 October, 08:40" in the person's language; empty when not a full value. */
function words(local: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);
}

const VIDEO_MAX = 50 * 1024 * 1024;

/**
 * Photos are resized on the device and uploaded to social/<account>/uploads/;
 * videos go up as they are (Instagram processes them). The public URL is the
 * field's value, held by the parent so a server answer never loses it.
 */
function UploadField({ name, accountId, t, required, hint, video, value, onChange }: {
  name: string; accountId: string; t: Words; required?: boolean; hint?: string; video?: boolean; value: string; onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function onPick(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      let blob: Blob = file; let ext = "jpg"; let type = "image/jpeg";
      if (video) {
        const isMov = /quicktime|\.mov$/i.test(file.type + file.name);
        if (!/video\/(mp4|quicktime)/.test(file.type) && !/\.(mp4|mov)$/i.test(file.name)) throw new Error(t.errors.videoType);
        if (file.size > VIDEO_MAX) throw new Error(t.uploadVideoHint);
        ext = isMov ? "mov" : "mp4"; type = isMov ? "video/quicktime" : "video/mp4";
      } else {
        blob = await resize(file, 2000);
      }
      const supabase = createClient();
      const path = `${accountId}/uploads/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("social").upload(path, blob, { contentType: type, upsert: false });
      if (upErr) throw upErr;
      onChange(supabase.storage.from("social").getPublicUrl(path).data.publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.uploadFailed);
    } finally {
      setBusy(false);
    }
  }
  const label = video ? (value ? t.uploadVideoReplace : t.uploadVideo) : (value ? t.uploadReplace : t.upload);
  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={value} />
      <input ref={input} type="file" accept={video ? "video/mp4,video/quicktime,.mp4,.mov" : "image/jpeg,image/png,image/webp,image/*"} className="sr-only" onChange={(e) => onPick(e.target.files?.[0])} />
      <div className="flex items-center gap-3">
        {value && !video ? <img src={value} alt="" className="h-16 w-16 rounded-xl object-cover" /> : null}
        {value && video ? <span className="text-sm text-success">{t.videoReady}</span> : null}
        <Button type="button" variant={value ? "secondary" : "soft"} disabled={busy} onClick={() => input.current?.click()}>{busy ? t.uploading : label}</Button>
      </div>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      {required && !value ? <input tabIndex={-1} className="sr-only" required value={value} onChange={() => {}} aria-hidden /> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}

async function resize(file: File, max: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.9));
}
