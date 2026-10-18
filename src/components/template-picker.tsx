import { setTemplateAction } from "@core/actions/theme";
import { TEMPLATES, type Template } from "@core/lib/theme";
import { cx } from "@core/components/ui";
import { getCoreDict } from "@core/i18n";

/**
 * Look picker: a <details> menu of the five Atlas templates. Each option is a
 * submit button in a plain form, so it works before hydration (like ThemeToggle).
 * The swatch carries its own data-template, so it shows that look's accent.
 */
export async function TemplatePicker({ template, back, className }: { template: Template; back: string; className?: string }) {
  const t = (await getCoreDict()).controls;
  return (
    <details className={cx("group relative", className)}>
      <summary
        aria-label={t.changeLook}
        title={t.look}
        className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden data-template={template} className="size-3.5 rounded-full bg-accent ring-1 ring-border" />
        <span className="hidden sm:inline">{t.look}</span>
      </summary>
      <form
        action={setTemplateAction}
        className="ap-picker-panel absolute right-0 top-full z-30 mt-2 grid w-60 gap-0.5 rounded-xl border border-border bg-surface p-1.5 text-fg shadow-pop"
      >
        <input type="hidden" name="back" value={back} />
        {TEMPLATES.map((tpl) => {
          const on = tpl.id === template;
          return (
            <button
              key={tpl.id}
              type="submit"
              name="template"
              value={tpl.id}
              aria-pressed={on}
              className={cx(
                "flex min-h-11 items-center gap-3 rounded-lg px-2.5 text-left transition-colors hover:bg-surface-2",
                on && "bg-surface-2",
              )}
            >
              <span aria-hidden data-template={tpl.id} className="size-5 shrink-0 rounded-full bg-accent ring-2 ring-surface" />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="text-sm font-medium">{tpl.name}</span>
                <span className="text-xs text-muted">{t.looks[tpl.id]}</span>
              </span>
              {on ? <span aria-hidden className="ml-auto text-accent">✓</span> : null}
            </button>
          );
        })}
      </form>
    </details>
  );
}
