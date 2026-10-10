import type { SupabaseClient } from '@supabase/supabase-js';
import { readContributionPages, type Contribution } from './contributions';
import { photoDisplaySource } from '../photos/photoPresentation';

type RecordData = Record<string, any>;
export type CatalogLink = { label: string; id?: number; name?: string };
export type PageDetail = { photos: number | null; catalog: CatalogLink[] };
export type ContributionPhoto = { url?: string; name: string; view: string; bestVentral: boolean; bestDorsal: boolean; heic: boolean };
export const CONTRIBUTION_BATCH_SIZE = 50;
export function contributionBatches(items: Contribution[], count: number) {
  const visible = items.slice(0, Math.max(CONTRIBUTION_BATCH_SIZE, count));
  const batches: Contribution[][] = [];
  for (let i = 0; i < visible.length; i += CONTRIBUTION_BATCH_SIZE) {
    batches.push(visible.slice(i, i + CONTRIBUTION_BATCH_SIZE));
  }
  return { items: visible, batches, hasMore: visible.length < items.length };
}
export function aggregatePhotoCounts(rows: { fk_sighting_id: number }[]) {
  const counts = new Map<number, number>();
  for (const row of rows) counts.set(row.fk_sighting_id, (counts.get(row.fk_sighting_id) ?? 0) + 1);
  return counts;
}
export function modernCatalogLinks(mantas: RecordData[], row: Contribution, permanent: RecordData[]): CatalogLink[] {
  return mantas.map(m => {
    if (m.noMatch === true) {
      const id = row.status === 'Accepted' ? permanent.find(p => p.submission_manta_id === m.id)?.fk_catalog_id : null;
      return id ? { label: 'New', id } : { label: row.status === 'Pending' ? 'New — pending approval' : 'New — not committed' };
    }
    if (m.matchedCatalogId) return { label: 'Match', id: m.matchedCatalogId };
    return { label: 'Pending decision' };
  });
}
export function historicalCatalogLinks(mantas: RecordData[]): CatalogLink[] {
  return [...new Set<number>(mantas.map(m => m.fk_catalog_id).filter(Boolean))].map(id => ({ label: 'Catalog', id }));
}

// Only the visible page is enriched. All lists are paginated to avoid REST row caps.
export async function loadContributionPage(client: SupabaseClient, userId: string, rows: Contribution[]): Promise<Record<string, PageDetail>> {
  const sightingIds = [...new Set(rows.map(r => r.sightingId).filter((id): id is number => id != null))];
  const historicalIds = rows.filter(r => r.source === 'historical').map(r => r.sightingId!);
  const submissionIds = rows.filter(r => r.source === 'submission').map(r => r.submissionId!);
  const [photos, mantas, submissions] = await Promise.all([
    historicalIds.length ? readContributionPages<{ fk_sighting_id: number }>((from,to) => client.from('photos').select('pk_photo_id,fk_sighting_id').in('fk_sighting_id',historicalIds).order('pk_photo_id').range(from,to)) : [],
    sightingIds.length ? readContributionPages<RecordData>((from,to) => client.from('mantas').select('pk_manta_id,fk_sighting_id,fk_catalog_id,submission_manta_id').in('fk_sighting_id',sightingIds).order('pk_manta_id').range(from,to)) : [],
    submissionIds.length ? readContributionPages<RecordData>((from,to) => client.from('sighting_submissions').select('id,mantas:payload->mantas').eq('submitted_by',userId).in('id',submissionIds).order('id').range(from,to)) : [],
  ]);
  const counts = aggregatePhotoCounts(photos);
  const details: Record<string,PageDetail> = {};
  for (const row of rows) {
    const permanent = mantas.filter(m => m.fk_sighting_id === row.sightingId);
    const draft = submissions.find(s => s.id === row.submissionId)?.mantas;
    details[row.key] = { photos: row.source === 'historical' ? counts.get(row.sightingId!) ?? 0 : row.photos,
      catalog: row.source === 'historical' ? historicalCatalogLinks(permanent) : modernCatalogLinks(Array.isArray(draft) ? draft : [],row,permanent) };
  }
  const ids = [...new Set(Object.values(details).flatMap(d => d.catalog.map(c => c.id)).filter((id): id is number => id != null))];
  const names = new Map<number,string>();
  for (let i=0;i<ids.length;i+=100) {
    const found = await readContributionPages<RecordData>((from,to) => client.from('catalog').select('pk_catalog_id,name').in('pk_catalog_id',ids.slice(i,i+100)).order('pk_catalog_id').range(from,to));
    for (const c of found) names.set(c.pk_catalog_id,c.name);
  }
  for (const d of Object.values(details)) for (const c of d.catalog) if (c.id) c.name = names.get(c.id) || String(c.id);
  return details;
}

export async function loadContributionDetail(client: SupabaseClient, userId: string, row: Contribution) {
  const result = row.source === 'submission'
    ? await client.from('sighting_submissions').select('payload,status,reject_reason,sighting_date').eq('submitted_by',userId).eq('id',row.submissionId!).single()
    : await client.from('sightings').select('sighting_date,island,sitelocation,location,latitude,longitude,location_unknown,start_time,end_time,standardize_survey,photographer,organization,behavior,notes,total_mantas,total_survey_time,population').eq('pk_sighting_id',row.sightingId!).single();
  if (result.error) throw result.error;
  return result.data as RecordData;
}
function publicImage(client: SupabaseClient, path?: string, bucket = 'manta-images') {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  let key = path.replace(/^\/+/, '').replace(/^browse\//i, '');
  const publicPath = key.match(/^storage\/v1\/object\/public\/([^/]+)\/(.*)$/i);
  if (publicPath) { bucket = publicPath[1]; key = publicPath[2]; }
  else if (key.startsWith(`${bucket}/`)) key = key.slice(bucket.length + 1);
  return bucket === "manta-images" ? `${bucket}/${key}` : client.storage.from(bucket).getPublicUrl(key).data.publicUrl;
}
export function payloadPhotos(client: SupabaseClient, payload: RecordData): ContributionPhoto[] {
  return (Array.isArray(payload.mantas) ? payload.mantas : []).flatMap((m: RecordData) => (Array.isArray(m.photos) ? m.photos : []).map((p: RecordData) => {
    const durable = p.path && p.storageBucket === 'manta-images' ? publicImage(client,p.path,p.storageBucket) : typeof p.url === 'string' && p.url.trim() && !p.url.startsWith('blob:') ? p.url : publicImage(client,p.path,p.storageBucket);
    const url = photoDisplaySource({url: durable,previewUrl:p.previewUrl});
    const name = String(p.name || p.path || 'Photo');
    return {url,name,view:p.view || 'other',bestVentral:!!p.isBestVentral,bestDorsal:!!p.isBestDorsal,
      heic: /\.(heic|heif)(?:$|\?)/i.test(url || name)};
  }));
}
export async function loadContributionPhotos(client: SupabaseClient, userId: string, row: Contribution): Promise<ContributionPhoto[]> {
  if (row.source === 'submission' && !(row.status === 'Accepted' && row.sightingId)) {
    const detail = await loadContributionDetail(client,userId,row);
    return payloadPhotos(client,detail.payload || {});
  }
  const photos = await readContributionPages<RecordData>((from,to) => client.from('photos')
    .select('pk_photo_id,file_name2,storage_path,storage_bucket,photo_view,is_best_manta_ventral_photo,is_best_manta_dorsal_photo')
    .eq('fk_sighting_id',row.sightingId!).order('pk_photo_id').range(from,to));
  return photos.map(p => ({url:publicImage(client,p.storage_path,p.storage_bucket || 'manta-images'),name:p.file_name2 || 'Photo',view:p.photo_view || 'other',bestVentral:!!p.is_best_manta_ventral_photo,bestDorsal:!!p.is_best_manta_dorsal_photo,heic:/\.(heic|heif)$/i.test(p.storage_path || p.file_name2 || '')}));
}
export async function loadContributionCatalog(client: SupabaseClient, id: number) {
  const [view, size] = await Promise.all([
    client.from('catalog_with_photo_view').select('pk_catalog_id,name,species,gender,age_class,populations,islands,first_sighting,last_sighting,total_sightings,best_catalog_ventral_path,best_catalog_ventral_thumb_url').eq('pk_catalog_id',id).single(),
    client.from('catalog').select('last_size_m').eq('pk_catalog_id',id).single(),
  ]);
  if (view.error) throw view.error;
  if (size.error) throw size.error;
  return {...view.data,...size.data,image:publicImage(client,view.data.best_catalog_ventral_path || view.data.best_catalog_ventral_thumb_url)};
}
export function detailFields(data: RecordData, source: Contribution['source']): [string, unknown][] {
  const p = source === 'submission' ? data.payload || {} : data;
  const fields: [string,unknown][] = source === 'submission' ? [
    ['Sighting date',p.date || data.sighting_date],['Survey type',p.standardize_survey === 'Yes' ? 'Systematic survey' : p.standardize_survey === 'No' ? 'Opportunistic sighting/photos' : null],
    ['Start',p.startTime],['Stop',p.stopTime],['Photographer',p.photographer],['Email',p.email],['Phone',p.phone],
    ['Island',p.island],['Location',p.locationName || p.sitelocation],['Location unknown',p.location_unknown === true ? 'Yes' : 'No'],['Latitude',p.latitude],['Longitude',p.longitude],['Notes',p.notes],
    ['Methods',p.methods ? [p.methods.pairedLaser && 'Paired-laser photogrammetry',p.methods.biopsySampling && 'Biopsy sampling',p.methods.tagDeployment && 'Tag deployment'].filter(Boolean).join(', ') : null],
    ['Rejection reason',data.status === 'rejected' ? data.reject_reason : null],
  ] : [['Sighting date',p.sighting_date],['Survey type',p.standardize_survey],['Island',p.island],['Location',p.sitelocation || p.location],['Location unknown',p.location_unknown ? 'Yes' : null],['Latitude',p.latitude],['Longitude',p.longitude],['Start',p.start_time],['Stop',p.end_time],['Photographer',p.photographer],['Organization',p.organization],['Behavior',p.behavior],['Notes',p.notes],['Total mantas',p.total_mantas],['Survey duration',p.total_survey_time],['Population',p.population]];
  return fields.filter(([,v]) => v !== null && v !== undefined && v !== '');
}
