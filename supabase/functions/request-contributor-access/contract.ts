// Pure shared validation. No credentials, client, or database access in this module.
export const REGIONS = ['Maui Nui', 'Oʻahu', 'Kauaʻi / Niʻihau'] as const;
export const PHOTO_COUNTS = ['1–5', '6–20', '21–50', '51–100', '100+'] as const;
export type AccessRequest = {
  full_name: string; email: string; organization: string | null; regions: string[];
  photo_count_range: string | null; earliest_year: number | null; experience_notes: string | null;
};
export type Validation = { kind: 'honeypot' } | { kind: 'invalid'; message: string } | { kind: 'valid'; value: AccessRequest };
const keys = ['fullName', 'email', 'organization', 'regions', 'photoCountRange', 'earliestYear', 'experienceNotes', 'ownsPhotos', 'reliableDetails', 'acceptsReview', 'website'];
export function validateAccessRequest(input: unknown, year = new Date().getUTCFullYear()): Validation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { kind: 'invalid', message: 'Check the request fields.' };
  const b = input as Record<string, unknown>;
  if (typeof b.website === 'string' && b.website.trim()) return { kind: 'honeypot' };
  if (Object.keys(b).some(k => !keys.includes(k)) || (b.website !== undefined && typeof b.website !== 'string')) return { kind: 'invalid', message: 'Check the request fields.' };
  // Reject markup rather than rendering it; strip non-printing control characters.
  const text = (v: unknown, max: number): string | null => {
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string' || v.length > max || /[<>]/.test(v)) return null;
    return v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  };
  const name = text(b.fullName, 120), email = text(b.email, 254)?.toLowerCase();
  if (!name) return { kind: 'invalid', message: 'Enter your full name (up to 120 characters).' };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { kind: 'invalid', message: 'Enter a valid email address.' };
  const organization = text(b.organization, 200), notes = text(b.experienceNotes, 2000);
  if (organization === null || notes === null) return { kind: 'invalid', message: 'Use plain text: affiliation up to 200 characters and description up to 2,000.' };
  if (!Array.isArray(b.regions) || !b.regions.length || b.regions.length > 3 || b.regions.some(r => !REGIONS.includes(r)) || new Set(b.regions).size !== b.regions.length) return { kind: 'invalid', message: 'Choose at least one of the listed regions.' };
  if (b.ownsPhotos !== true || b.reliableDetails !== true || b.acceptsReview !== true) return { kind: 'invalid', message: 'Please confirm all three contribution statements.' };
  const count = b.photoCountRange;
  if (count != null && count !== '' && !PHOTO_COUNTS.includes(count as typeof PHOTO_COUNTS[number])) return { kind: 'invalid', message: 'Choose a listed photo-count range.' };
  const rawYear = b.earliestYear;
  const earliestYear = rawYear == null || rawYear === '' ? null : typeof rawYear === 'number' ? rawYear : typeof rawYear === 'string' && /^\d{4}$/.test(rawYear) ? Number(rawYear) : NaN;
  if (earliestYear !== null && (!Number.isInteger(earliestYear) || earliestYear < 1826 || earliestYear > year)) return { kind: 'invalid', message: `Enter a year between 1826 and ${year}, or leave it blank.` };
  return { kind: 'valid', value: { full_name: name, email, organization: organization || null, regions: b.regions as string[], photo_count_range: (count || null) as string | null, earliest_year: earliestYear, experience_notes: notes || null } };
}
