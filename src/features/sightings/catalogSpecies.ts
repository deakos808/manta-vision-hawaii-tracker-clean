/** Proposed identity species; catalog.species becomes authoritative on resolution. */
export type CatalogSpecies = 'mobula alfredi' | 'mobula birostris';
export const SPECIES_OPTIONS = [
  { value: '', label: 'Unknown / not specified' },
  { value: 'mobula alfredi', label: 'Reef manta — Mobula alfredi' },
  { value: 'mobula birostris', label: 'Oceanic manta — Mobula birostris' },
] as const;
export function speciesLabel(value?: string | null): string {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'mobula alfredi' || normalized === 'alfredi') return 'Reef manta';
  if (normalized === 'mobula birostris' || normalized === 'birostris') return 'Oceanic manta';
  return value || '—';
}
