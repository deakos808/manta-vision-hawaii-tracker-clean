// Lookup normalization mirrors lower(btrim(...)): remove surrounding spaces only.
export const normalizePhotographer = (value: string) => value.replace(/^ +| +$/g, "").toLowerCase();
export type HistoryCandidate = {
  status: "eligible" | "none" | "ambiguous" | "mapped";
  alias?: string;
  sightings?: number;
  mantas?: number;
  photos?: number;
  first?: string | null;
  latest?: string | null;
};

export function exactPhotographer(names: string[], input: string): HistoryCandidate {
  const normalized = normalizePhotographer(input);
  const matches = [...new Set(names.filter(name => normalized && normalizePhotographer(name) === normalized))];
  return matches.length === 1 ? { status: "eligible", alias: matches[0] }
    : { status: matches.length ? "ambiguous" : "none" };
}

// Service client is supplied only after the endpoint's active-admin authorization.
// Page through names: PostgREST cannot express lower(btrim(column)) without a new RPC.
export async function checkInviteHistory(client: any, input: string): Promise<HistoryCandidate> {
  const names: string[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await client.from("sightings").select("photographer").order("pk_sighting_id").range(from, from + 499);
    if (error) throw new Error("Historical contributions could not be checked.");
    names.push(...data.map((row: any) => row.photographer).filter((name: unknown) => typeof name === "string"));
    if (data.length < 500) break;
  }
  const candidate = exactPhotographer(names, input);
  if (candidate.status !== "eligible") return candidate;
  for (let from = 0; ; from += 500) {
    const { data, error } = await client.from("contributor_legacy_aliases").select("photographer_alias").order("photographer_alias").range(from, from + 499);
    if (error) throw new Error("Historical links could not be checked.");
    if (data.some((row: any) => normalizePhotographer(row.photographer_alias) === normalizePhotographer(candidate.alias!))) return { status: "mapped" };
    if (data.length < 500) break;
  }
  const dates: string[] = [];
  let sightings = 0, mantas = 0, photos = 0;
  for (let from = 0; ; from += 500) {
    const { data, error } = await client.from("sightings").select("pk_sighting_id,sighting_date").eq("photographer", candidate.alias).order("pk_sighting_id").range(from, from + 499);
    if (error) throw new Error("Historical summary could not be loaded.");
    sightings += data.length;
    dates.push(...data.map((row: any) => row.sighting_date).filter(Boolean));
    // Small ID batches keep the REST URL bounded; counts use direct sighting FKs.
    for (let i = 0; i < data.length; i += 100) {
      const ids = data.slice(i, i + 100).map((row: any) => row.pk_sighting_id);
      const [m, p] = await Promise.all([
        client.from("mantas").select("pk_manta_id", { count: "exact", head: true }).in("fk_sighting_id", ids),
        client.from("photos").select("pk_photo_id", { count: "exact", head: true }).in("fk_sighting_id", ids),
      ]);
      if (m.error || p.error) throw new Error("Historical summary could not be loaded.");
      mantas += m.count ?? 0; photos += p.count ?? 0;
    }
    if (data.length < 500) break;
  }
  dates.sort();
  return { ...candidate, sightings, mantas, photos, first: dates[0] ?? null, latest: dates.at(-1) ?? null };
}

export async function requireInviteAlias(client: any, value: unknown): Promise<string> {
  if (typeof value !== "string" || !normalizePhotographer(value)) throw new Error("A nonempty historical photographer alias is required.");
  const candidate = await checkInviteHistory(client, value);
  if (candidate.status !== "eligible") throw new Error(candidate.status === "mapped"
    ? "Historical contributions are already linked to another account."
    : "A single exact historical photographer match is required.");
  return candidate.alias!;
}

export const LINK_WARNING = "Invitation sent, but historical contributions could not be linked. Review the user before retrying the historical link.";
export async function linkInvitedHistory(client: any, userId: string, alias: string): Promise<boolean> {
  try {
    if (!userId) return false;
    const exactAlias = await requireInviteAlias(client, alias);
    const { error } = await client.from("contributor_legacy_aliases").insert({ user_id: userId, photographer_alias: exactAlias });
    // The normalized unique index also rejects a concurrent invitation's claim.
    return !error;
  } catch { return false; }
}
