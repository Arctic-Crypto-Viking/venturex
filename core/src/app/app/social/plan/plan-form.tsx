"use client";

import { useActionState, useState } from "react";
import { Button, Chip, Choice, Field, Input, Notice, Select, fieldRow } from "@core/components/ui";
import type { CoreDict } from "@core/i18n";
import { createPlanAction, type PlanState } from "./actions";

type Words = CoreDict["files"]["plan"];

/** The rhythm, on one phone screen: where, how often, which days, what time, from which folders. */
export function PlanForm({ t, connections, folders, photos, videos, max }: {
  t: Words; connections: Array<{ id: string; label: string }>; folders: Array<{ id: string; name: string; count: number }>; photos: number; videos: number; max: number;
}) {
  const [state, formAction, pending] = useActionState(createPlanAction, undefined as PlanState);
  const [perWeek, setPerWeek] = useState(3);
  const [days, setDays] = useState<number[]>([2, 4, 6]);
  const [kinds, setKinds] = useState<Array<"image" | "video">>(videos > 0 ? ["image", "video"] : ["image"]);
  const [picked, setPicked] = useState<string[]>([]);
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const window = 30;
  const slots = Math.round((days.length || perWeek) * (window / 7));
  const files = (kinds.includes("image") ? photos : 0) + (kinds.includes("video") ? videos : 0);
  const expected = Math.min(slots, files, max === -1 ? Infinity : max);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="tz" value={tz} />
      <input type="hidden" name="days" value={window} />
      {connections.length === 1 ? <input type="hidden" name="account" value={connections[0].id} /> : (
        <Field label={t.postTo}><Select name="account" defaultValue={connections[0]?.id}>{connections.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
      )}
      <div className={fieldRow[2]}>
        <Field label={t.perWeek}>
          <Select name="per_week" value={perWeek} onChange={(e) => { const n = Number(e.target.value); setPerWeek(n); setDays(DEFAULT_DAYS[n] ?? days); }}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
        <Field label={t.time} hint={t.timeHint}>
          <div className={fieldRow.pair}>
            <Input type="number" name="hour" min={0} max={23} defaultValue={18} inputMode="numeric" />
            <Input type="number" name="minute" min={0} max={59} defaultValue={0} inputMode="numeric" className="w-20" />
          </div>
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t.days}</legend>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <Chip key={d} on={days.includes(d)} onClick={() => setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]))}>{t.weekdays[d]}</Chip>
          ))}
        </div>
        {days.map((d) => <input key={d} type="hidden" name="weekday" value={d} />)}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">{t.kinds}</legend>
        <Choice type="checkbox" name="kind" value="image" checked={kinds.includes("image")} onChange={() => setKinds((k) => (k.includes("image") ? k.filter((x) => x !== "image") : [...k, "image"]))} label={`${t.photos} · ${photos}`} />
        {videos > 0 ? <Choice type="checkbox" name="kind" value="video" checked={kinds.includes("video")} onChange={() => setKinds((k) => (k.includes("video") ? k.filter((x) => x !== "video") : [...k, "video"]))} label={`${t.videos} · ${videos}`} /> : null}
      </fieldset>
      {folders.length > 1 ? (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{t.folders}</legend>
          <div className="flex flex-wrap gap-1.5">
            <Chip on={picked.length === 0} onClick={() => setPicked([])}>{t.allFolders}</Chip>
            {folders.map((f) => <Chip key={f.id} on={picked.includes(f.id)} onClick={() => setPicked((p) => (p.includes(f.id) ? p.filter((x) => x !== f.id) : [...p, f.id]))}>{f.name} <span className="opacity-60">{f.count}</span></Chip>)}
          </div>
          {picked.map((id) => <input key={id} type="hidden" name="folder" value={id} />)}
        </fieldset>
      ) : null}
      <p className="text-sm text-muted">{t.available.replace("{n}", String(files)).replace("{m}", String(slots)).replace("{d}", String(window))}</p>
      {state?.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Button type="submit" size="lg" disabled={pending || expected === 0 || kinds.length === 0}>{pending ? t.making : `${t.make} · ${expected === Infinity ? slots : expected}`}</Button>
    </form>
  );
}

const DEFAULT_DAYS: Record<number, number[]> = { 1: [4], 2: [2, 5], 3: [2, 4, 6], 4: [1, 3, 5, 6], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6] };
