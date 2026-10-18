// Platform core route — the code lives in core/ (core/README.md). Segment config stays here: Next reads it statically.
export const dynamic = "force-dynamic"; // per-user data, never prerendered
export { default } from "@core/app/app/feedback/page";
