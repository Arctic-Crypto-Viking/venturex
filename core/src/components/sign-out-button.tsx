import { signOutAction } from "@core/actions/auth";
import { cx } from "@core/components/ui";

/** Sign out as a plain form, so it works before hydration (like ThemeToggle). Pass `className` to match the place it sits in. */
export function SignOutButton({ className, label = "Sign out" }: { className?: string; label?: string }) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className={cx(className ?? "inline-flex h-9 items-center rounded-lg px-2.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg")}
      >
        {label}
      </button>
    </form>
  );
}
