import { Button, ButtonLink, Card, Field, Input, Notice, Section, Select, Textarea, fieldRow } from "@core/components/ui";
import { fill } from "@core/lib/i18n-shared";
import { FONT_KEYS } from "@core/lib/social/db";
import { FONT_FAMILY } from "@core/lib/social/render";
import { product } from "@product";
import { loadSocial, SOCIAL_PATH } from "../context";
import { SocialShell } from "../shell";
import { saveBrandKitAction } from "../actions";
import { ensureKit } from "./kit";
import { BrandLogoUploader } from "./logo-uploader";

export const metadata = { title: "Brand kit" };

/**
 * Brand kit (§2.3 step 2, and a step of the product's guide since 20 Oct 2026): opens
 * pre-filled from the product's actor (logo, name, colour from the logo, genres as the
 * signature and hashtags), asks for the logo when there is none, editable. Saving sets
 * confirmed_at (031), which the product's readiness checklist reads. The look the
 * person uses in the app never leaks into the brand (founder decision 4).
 */
export default async function BrandKitPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ctx = await loadSocial(`${SOCIAL_PATH}/brand`);
  const t = ctx.dict.social.brand;
  const kit = await ensureKit(ctx);
  const upload = product.social?.logoUpload; // the page asks for the logo itself when the product says where it lives
  const tags = (kit.hashtag_sets?.default ?? []).join(" ");

  return (
    <SocialShell ctx={ctx}>
      <Section title={t.title}>
        <p className="-mt-1 text-sm text-muted">{fill(t.intro, { name: ctx.actor.name })}</p>
        {typeof sp.saved === "string" ? <Notice tone="success">{t.saved}</Notice> : null}
        {typeof sp.error === "string" ? <Notice tone="danger">{sp.error}</Notice> : null}
        {!kit.confirmed_at ? <Notice tone="accent">{t.firstTime}</Notice> : null}
        <Card className="flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl" style={{ backgroundColor: kit.primary_color }}>
            {kit.logo_url ? <img src={kit.logo_url} alt="" className="h-full w-full object-contain p-1.5" /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t.logo}</p>
            <p className="text-sm text-muted">{kit.logo_url ? (upload ? t.logoRules : t.logoHint) : upload ? t.askLogo : t.noLogo}</p>
          </div>
          {upload ? (
            <BrandLogoUploader
              bucket={upload.bucket}
              path={upload.path(ctx.account.id, ctx.actor.id)}
              hasLogo={Boolean(kit.logo_url)}
              labels={{ add: t.addLogo, replace: t.replaceLogo, busy: t.uploading, failed: t.uploadFailed }}
            />
          ) : product.social?.logoPath ? <ButtonLink href={product.social.logoPath} size="sm">{t.editLogo}</ButtonLink> : null}
        </Card>
        <form action={saveBrandKitAction} className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold">{t.colours}</h3>
            <div className={fieldRow[2]}>
              <Field label={t.primary} hint={kit.logo_url ? t.pickedFromLogo : undefined}>
                <div className={fieldRow.pair}><Input name="primary_color" defaultValue={kit.primary_color} pattern="#[0-9a-fA-F]{6}" /><input type="color" defaultValue={kit.primary_color} className="h-12 w-14 rounded-xl border border-border bg-surface" onChange={undefined} aria-hidden tabIndex={-1} /></div>
              </Field>
              <Field label={t.secondary}><Input name="secondary_color" defaultValue={kit.secondary_color} pattern="#[0-9a-fA-F]{6}" /></Field>
            </div>
            <Field label={t.font}>
              <Select name="font_key" defaultValue={kit.font_key}>
                {FONT_KEYS.map((k) => <option key={k} value={k}>{FONT_FAMILY[k]}</option>)}
              </Select>
            </Field>
          </Card>
          <Card className="flex flex-col gap-4">
            <Field label={t.signature} hint={t.signatureHint}><Input name="signature" defaultValue={kit.signature ?? ""} maxLength={120} /></Field>
            <Field label={t.handle}><Input name="handle" defaultValue={kit.handle ?? ""} placeholder="@" /></Field>
            <Field label={t.hashtags} hint={t.hashtagsHint}><Textarea name="hashtags" defaultValue={tags} rows={3} /></Field>
            <Field label={t.language}><Input name="language" defaultValue={kit.language} maxLength={3} className="w-24" /></Field>
          </Card>
          <Button type="submit" size="lg">{t.save}</Button>
        </form>
      </Section>
    </SocialShell>
  );
}
