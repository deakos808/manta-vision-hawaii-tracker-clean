export const ACCEPTED_DORSAL_CATALOG_ANCHOR_PHOTO_IDS = new Set<number>([
  4535,
  4738,
  4829,
  7009,
  7096,
]);

export function isAcceptedDorsalCatalogAnchor(photoId: unknown) {
  const numericId = Number(photoId);
  return Number.isFinite(numericId) && ACCEPTED_DORSAL_CATALOG_ANCHOR_PHOTO_IDS.has(numericId);
}
