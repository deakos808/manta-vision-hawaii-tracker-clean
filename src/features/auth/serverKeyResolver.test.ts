import assert from "node:assert/strict";
import test from "node:test";
import {
  resolvePublishableKey,
  resolveSecretKey,
} from "../../../supabase/functions/_shared/server-keys.ts";

function environment(values: Record<string, string | undefined>) {
  return (name: string) => values[name];
}

test("resolves non-empty default values from plural key maps", () => {
  assert.equal(
    resolvePublishableKey(environment({
      SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: "publishable-test" }),
    })),
    "publishable-test",
  );
  assert.equal(
    resolveSecretKey(environment({
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: "secret-test" }),
    })),
    "secret-test",
  );
});

test("plural maps take precedence over legacy values", () => {
  assert.equal(
    resolvePublishableKey(environment({
      SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: "map-value" }),
      SUPABASE_PUBLISHABLE_KEY: "legacy-value",
      SUPABASE_ANON_KEY: "older-value",
    })),
    "map-value",
  );
});

test("legacy values are used only when the plural variable is absent", () => {
  assert.equal(
    resolvePublishableKey(environment({ SUPABASE_ANON_KEY: "legacy-anon" })),
    "legacy-anon",
  );
  assert.equal(
    resolveSecretKey(environment({ SERVICE_ROLE_KEY: "legacy-service" })),
    "legacy-service",
  );
});

for (const [name, value] of [
  ["malformed plural JSON", "not-json"],
  ["empty map", "{}"],
  ["missing default", JSON.stringify({ named: "value" })],
  ["empty default", JSON.stringify({ default: "  " })],
] as const) {
  test(`fails closed for ${name} without legacy fallback`, () => {
    assert.throws(
      () => resolveSecretKey(environment({
        SUPABASE_SECRET_KEYS: value,
        SUPABASE_SERVICE_ROLE_KEY: "must-not-be-used",
      })),
      /Invalid server key configuration: SUPABASE_SECRET_KEYS\./,
    );
  });
}

test("fails closed when no key is available", () => {
  assert.throws(
    () => resolvePublishableKey(environment({})),
    /Missing server key configuration: SUPABASE_PUBLISHABLE_KEYS\./,
  );
});

test("credential values never appear in errors or logs", () => {
  const marker = "fabricated-sensitive-marker";
  const logged: unknown[][] = [];
  const originalError = console.error;
  const originalLog = console.log;
  console.error = (...args: unknown[]) => logged.push(args);
  console.log = (...args: unknown[]) => logged.push(args);
  try {
    let message = "";
    try {
      resolveSecretKey(environment({
        SUPABASE_SECRET_KEYS: `{\"default\":\"${marker}`,
      }));
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    assert.ok(message);
    assert.doesNotMatch(message, new RegExp(marker));
    assert.equal(logged.length, 0);
  } finally {
    console.error = originalError;
    console.log = originalLog;
  }
});
