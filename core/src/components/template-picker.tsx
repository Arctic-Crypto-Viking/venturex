import { setTemplateAction } from "@core/actions/theme";
import { TEMPLATES, type Template } from "@core/lib/theme";
import { cx } from "@core/components/ui";
import { getCoreDict } from "@core/i18n";

/**
 * Look picker: a <details> menu of the five Atlas templates. Each option is a
 * submit button in a plain form, so it works before hydration (like ThemeToggle).
 * The swatch carries its own data-template, so it shows that look's accent.
 * `inline` drops the menu and lays the looks out in place (a settings page).
 */
export async function TemplatePicker({ template, back, className, inline = false }: { template: Template; back: string; className?: string; inline?: boolean }) {
  const t = (await getCoreDict()).controls;
  const options = TEMPLATES.map((tpl) => {
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
          inline && "min-h-14 border border-border px-3.5",
          on && (inline ? "border-accent bg-accent-soft" : "bg-surface-2"),
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
  });
  if (inline) {
    return (
      <form action={setTemplateAction} aria-label={t.changeLook} className={cx("grid grid-cols-1 gap-2 sm:grid-cols-2", className)}>
        <input type="hidden" name="back" value={back} />
        {options}
      </form>
    );
  }
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
        {options}
      </form>
    </details>
  );
}
