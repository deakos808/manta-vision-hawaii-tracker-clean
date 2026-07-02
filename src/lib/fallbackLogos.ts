export const HAMER_FALLBACK_LOGO = "/hamer-icon.png";
export const MPRF_FALLBACK_LOGO = "/manta-pacific-logo.png";

export function fallbackLogoForRecord(isMprf: boolean | null | undefined) {
  return isMprf ? MPRF_FALLBACK_LOGO : HAMER_FALLBACK_LOGO;
}
