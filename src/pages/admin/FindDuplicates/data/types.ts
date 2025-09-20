export type CatalogSummary = {
  pk_catalog_id: number;
  id: string; // uuid
  name: string | null;
  species: string | null;
  gender: string | null;
  age_class: string | null;
  first_sighting: string | null;
  last_sighting: string | null;
  total_sightings: number | null;
  sitelocation: string | null;
  locations: string[] | null;
  populations: (string | number)[] | null;
  islands: string[] | null;
  notes: string | null;
  best_cat_ventral_id: number | null;
  best_cat_dorsal_id: number | null;
  best_catalog_ventral_path: string | null;
  best_catalog_dorsal_path: string | null;
};

export type PhotoRow = {
  pk_photo_id: number;
  storage_path: string;
  fk_catalog_id: number | null;
  is_best_manta_ventral_photo?: boolean | null;
};

// Shape returned by your merge-catalogs edge function
export type MergeResult = {
  primary_pk_catalog_id: number;
  secondary_pk_catalog_id: number;
  updated: Record<string, number>;
  deleted_secondary: boolean;
  actor_user_id?: string | null;
  note?: string;
};
