// src/utils/csvSchemas.ts

export const TABLES_WITH_CSV_SCHEMA = [
  'catalog',
  'sightings',
  'photos',
  'mantas',
  'mantas_new' // ✅ temporarily add to enable CSV import
] as const;

export type TableWithCsvSchema = (typeof TABLES_WITH_CSV_SCHEMA)[number];

export const csvSchemas: Record<TableWithCsvSchema, Record<string, { type: string; required?: boolean }>> = {
  catalog: {
    pk_catalog_id: { type: 'string', required: true },
    species: { type: 'string' },
    name: { type: 'string' },
    date_first_sighted: { type: 'date' },
    date_last_sighted: { type: 'date' },
    days_between_first_last: { type: 'number' }
  },
  sightings: {
    pk_sighting_id: { type: 'string', required: true },
    sighting_date: { type: 'date' },
    location: { type: 'string' },
    island: { type: 'string' },
    latitude: { type: 'number' },
    longitude: { type: 'number' },
    size: { type: 'string' },
    gender: { type: 'string' },
    age_class: { type: 'string' },
    tag: { type: 'string' },
    comments: { type: 'string' }
  },
  photos: {
    pk_photo_id: { type: 'string', required: true },
    fk_manta_id: { type: 'string' },
    sighting_id: { type: 'string' },
    file_name: { type: 'string' },
    is_best_sighting_photo: { type: 'string' },
    is_best_catalog_photo: { type: 'string' }
  },
  mantas: {
    pk_manta_id: { type: 'string', required: true },
    fk_survey_id: { type: 'string' },
    best_ventral_photo_id: { type: 'string' },
    ref_biopsy_id: { type: 'string' },
    ref_tag_id: { type: 'string' }
  },
  mantas_new: {
    pk_manta_id: { type: 'string', required: true },
    fk_survey_id: { type: 'string' },
    fk_catalog_id: { type: 'string' },
    fk_sighting_id: { type: 'string' },
    best_ventral_photo_id: { type: 'string' },
    ref_biopsy_id: { type: 'string' },
    ref_tag_id: { type: 'string' }
  }
};

export function getRequiredHeaders(table: TableWithCsvSchema): string[] {
  const schema = csvSchemas[table];
  return Object.entries(schema)
    .filter(([, val]) => val.required)
    .map(([key]) => key);
}
