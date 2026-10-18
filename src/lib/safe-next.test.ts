import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "./safe-next.ts"; // relative: node --test runs it without the bundler aliases

test("after sign-in, only paths on this site are followed", () => {
  assert.equal(safeNext("/app"), "/app");
  assert.equal(safeNext("/oauth/consent?authorization_id=abc-123"), "/oauth/consent?authorization_id=abc-123");
  assert.equal(safeNext("/onboarding?step=2#top"), "/onboarding?step=2#top");
  for (const bad of [
    null, "", "app", "https://evil.example", "//evil.example", "/\\evil.example", "/\\/evil.example",
    "/\t/evil.example", "javascript:alert(document.cookie)", " /app",
    "/.//evil.example", "/%2e//evil.example", "/a/..//evil.example", "/./\\evil.example",
  ]) {
    assert.equal(safeNext(bad), "/app", String(bad));
  }
  assert.equal(safeNext("//evil.example", "/login"), "/login");
});
