type EnvironmentReader = (name: string) => string | undefined;

const readDenoEnvironment: EnvironmentReader = (name) => Deno.env.get(name);

function defaultFromMap(raw: string, variableName: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid server key configuration: ${variableName}.`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid server key configuration: ${variableName}.`);
  }

  const value = (parsed as Record<string, unknown>).default;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid server key configuration: ${variableName}.`);
  }
  return value.trim();
}

function resolveKey(
  readEnvironment: EnvironmentReader,
  pluralName: string,
  legacyNames: readonly string[],
): string {
  const pluralValue = readEnvironment(pluralName);
  if (pluralValue !== undefined) {
    return defaultFromMap(pluralValue, pluralName);
  }

  for (const name of legacyNames) {
    const value = readEnvironment(name)?.trim();
    if (value) return value;
  }
  throw new Error(`Missing server key configuration: ${pluralName}.`);
}

export function resolvePublishableKey(
  readEnvironment: EnvironmentReader = readDenoEnvironment,
): string {
  return resolveKey(readEnvironment, "SUPABASE_PUBLISHABLE_KEYS", [
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
  ]);
}

export function resolveSecretKey(
  readEnvironment: EnvironmentReader = readDenoEnvironment,
): string {
  return resolveKey(readEnvironment, "SUPABASE_SECRET_KEYS", [
    "SUPABASE_SECRET_KEY",
    "SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);
}
