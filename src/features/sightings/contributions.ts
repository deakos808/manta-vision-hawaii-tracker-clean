import type { SupabaseClient } from '@supabase/supabase-js';

export type SubmissionContribution = {
  id: string; sighting_date: string | null; submitted_at: string | null;
  manta_count: number | null; photo_count: number | null; status: string;
  committed_pk_sighting_id: number | null; reject_reason: string | null;
  location_name?: string | null; location_unknown?: string | null;
  latitude?: string | null; longitude?: string | null; island?: string | null; sitelocation?: string | null;
};
export type HistoricalContribution = {
  pk_sighting_id: number; photographer: string; sighting_date: string | null;
  location: string | null; sitelocation: string | null; island: string | null;
  total_mantas: number | null;
};
export type Contribution = {
  source: 'submission' | 'historical'; submissionId?: string; sightingId?: number | null; island: string;
  key: string; date: string | null; submittedAt: string | null;
  location: string; mantas: number | null; photos: number | null;
  status: string; rejectReason?: string | null;
};

function submissionLocation(row: SubmissionContribution): string {
  if (row.location_unknown === 'true') return 'Unknown';
  if (row.location_name?.trim()) return row.location_name;
  if (row.sitelocation?.trim()) return row.sitelocation;
  return '—';
}

export function mergeContributions(owned: SubmissionContribution[], aliases: string[], historical: HistoricalContribution[]) {
  const committed = new Set(owned.map(row => row.committed_pk_sighting_id).filter(id => id != null));
  const exactAliases = new Set(aliases);
  const items: Contribution[] = owned.map(row => ({
    source: 'submission', submissionId: row.id, sightingId: row.committed_pk_sighting_id, island: row.location_unknown === 'true' ? '—' : row.island || '—',
    key: `submission-${row.id}`, date: row.sighting_date, submittedAt: row.submitted_at,
    location: submissionLocation(row), mantas: row.manta_count, photos: row.photo_count,
    status: ({ pending: 'Pending', committed: 'Accepted', rejected: 'Rejected' } as Record<string, string>)[row.status] ?? 'Unknown',
    rejectReason: row.status === 'rejected' ? row.reject_reason : null,
  }));
  for (const row of historical) {
    if (!exactAliases.has(row.photographer) || committed.has(row.pk_sighting_id)) continue;
    items.push({
      source: 'historical', sightingId: row.pk_sighting_id, island: row.island || '—',
      key: `historical-${row.pk_sighting_id}`, date: row.sighting_date, submittedAt: null,
      location: row.sitelocation || row.location || '—',
      mantas: row.total_mantas, photos: null, status: 'Historical',
    });
  }
  items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')
    || (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '') || a.key.localeCompare(b.key));
  return { items, total: items.length, latest: items[0]?.date ?? null, pending: items.filter(row => row.status === 'Pending').length };
}

// Read all pages so long-time contributors are not silently capped by the API limit.
export async function readContributionPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

export async function loadContributions(client: SupabaseClient, userId: string) {
  // Explicit owner filters also constrain admins; RLS remains the authorization boundary.
  // Project only location keys from payload, not photos or reviewer metadata.
  const [owned, aliases] = await Promise.all([
    readContributionPages<SubmissionContribution>((from, to) => client.from('sighting_submissions')
      .select('id,sighting_date,submitted_at,manta_count,photo_count,status,committed_pk_sighting_id,reject_reason,location_name:payload->>locationName,location_unknown:payload->>location_unknown,island:payload->>island,sitelocation:payload->>sitelocation')
      .eq('submitted_by', userId).order('id').range(from, to)),
    readContributionPages<{ photographer_alias: string }>((from, to) => client.from('contributor_legacy_aliases')
      .select('photographer_alias').eq('user_id', userId).order('photographer_alias').range(from, to)),
  ]);
  const names = aliases.map(row => row.photographer_alias);
  const historical: HistoricalContribution[] = [];
  // Exact equality; no case folding, fuzzy matching, or inferred aliases.
  for (const name of names) {
    historical.push(...await readContributionPages<HistoricalContribution>((from, to) => client.from('sightings')
      .select('pk_sighting_id,photographer,sighting_date,location,sitelocation,island,total_mantas')
      .eq('photographer', name).order('pk_sighting_id').range(from, to)));
  }
  return mergeContributions(owned, names, historical);
}
