import assert from "node:assert/strict";
import test from "node:test";
import { buildContentSecurityPolicy } from "./content-security-policy";

test("production scripts require a nonce and cannot use eval or inline event handlers", () => {
  const policy = buildContentSecurityPolicy("abcdefghijklmnopqrstuv123456");
  const scripts = policy.split("; ").find(value => value.startsWith("script-src "))!;
  assert.ok(scripts.includes("'nonce-abcdefghijklmnopqrstuv123456'"));
  assert.ok(scripts.includes("'strict-dynamic'"));
  assert.ok(!scripts.includes("'unsafe-inline'"));
  assert.ok(!scripts.includes("'unsafe-eval'"));
  assert.ok(policy.includes("script-src-attr 'none'"));
  assert.ok(policy.includes("object-src 'none'"));
  assert.ok(policy.includes("base-uri 'none'"));
  assert.ok(policy.includes("frame-ancestors 'self'"));
});

test("policy preserves same-origin PDF workers and document frames", () => {
  const policy = buildContentSecurityPolicy("abcdefghijklmnopqrstuv123456");
  assert.ok(policy.includes("worker-src 'self' blob:"));
  assert.ok(policy.includes("frame-src 'self' blob: data:"));
  assert.ok(policy.includes("https://login.microsoftonline.com"));
  assert.ok(!policy.includes("ws:"));
  assert.ok(buildContentSecurityPolicy("abcdefghijklmnopqrstuv123456", true).includes("'unsafe-eval'"));
});

test("nonce cannot inject another policy directive", () => {
  assert.throws(() => buildContentSecurityPolicy("x'; script-src *;"));
  assert.throws(() => buildContentSecurityPolicy(""));
});
