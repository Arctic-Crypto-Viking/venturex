"use client";

import type { ReactNode } from "react";

/** A plain form that asks once before it submits (disconnect, cancel a post). Works as a normal form without JS. */
export function ConfirmForm({ action, message, className, children }: { action: (fd: FormData) => Promise<void>; message: string; className?: string; children: ReactNode }) {
  return (
    <form action={action} className={className} onSubmit={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {children}
    </form>
  );
}
