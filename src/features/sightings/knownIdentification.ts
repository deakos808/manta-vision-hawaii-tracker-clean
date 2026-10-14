/** Pending-submission evidence only; the existing Catalog ID remains the decision. */
export type IdentificationProposal = {
  method: 'contributor_known' | 'photo_match';
  catalogName?: string | null;
  evidence?: string;
};
export type CatalogIdentity = {
  pk_catalog_id: number;
  name: string | null;
  species?: string | null;
  best_catalog_ventral_path?: string | null;
  best_catalog_ventral_thumb_url?: string | null;
};
export function catalogTextMatches(row: Pick<CatalogIdentity, 'pk_catalog_id' | 'name'>, search: string) {
  const text = search.trim().toLowerCase();
  return (row.name || '').normalize('NFC').trim().toLowerCase().includes(text) || String(row.pk_catalog_id).includes(text);
}
export function knownIdentification(row: CatalogIdentity, evidence: string) {
  return { matchedCatalogId: row.pk_catalog_id, potentialCatalogId: row.pk_catalog_id,
    noMatch: false, potentialNoMatch: false,
    identificationProposal: { method: 'contributor_known' as const, catalogName: row.name, evidence } };
}
