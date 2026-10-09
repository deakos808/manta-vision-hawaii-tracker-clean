import { locationPoint } from "../../components/map/locationSelection";

export type SubmissionField = 'date' | 'email' | 'startTime' | 'stopTime' | 'photoDates' | 'location';
export const MULTI_DATE_REVIEW_MESSAGE = 'Photos span multiple dates. Review the sighting date, Start Time, and Stop Time manually.';

type Issue = { field: SubmissionField; message: string };
type SurveyTimes = { standardizeSurvey: string | null; startTime: string; stopTime: string };
export const TIME_ORDER_MESSAGE = 'Stop time must be after start time.';

export function getSurveyTimeIssues(input: SurveyTimes): Issue[] {
  if (input.standardizeSurvey !== 'Yes') return [];
  const issues: Issue[] = [];
  if (!input.startTime.trim()) issues.push({ field: 'startTime', message: 'Start Time' });
  if (!input.stopTime.trim()) issues.push({ field: 'stopTime', message: 'Stop Time' });
  // Same-day wall-clock times; normalize optional seconds without timezone conversion.
  const seconds = (value: string) => {
    const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
    if (!match) return NaN;
    const [, h, m, s = '0'] = match;
    return +h < 24 && +m < 60 && +s < 60 ? +h * 3600 + +m * 60 + +s : NaN;
  };
  if (input.startTime.trim() && input.stopTime.trim()
      && !(seconds(input.stopTime) > seconds(input.startTime))) {
    issues.push({ field: 'stopTime', message: TIME_ORDER_MESSAGE });
  }
  return issues;
}

export function getApprovalIssues(input: SurveyTimes & {
  mantas: readonly { name?: string; matchedCatalogId?: number | string | null; noMatch?: boolean }[];
}): string[] {
  const issues = getSurveyTimeIssues(input).map(issue => issue.message);
  for (const [index, manta] of input.mantas.entries()) {
    const name = manta.name || `Manta ${index + 1}`;
    const matched = manta.matchedCatalogId != null;
    if (!matched && manta.noMatch !== true) issues.push(`${name}: select a catalog match or No Match.`);
    else if (matched && manta.noMatch === true) issues.push(`${name}: choose either a catalog match or No Match.`);
  }
  return issues;
}

export function approvalFailureMessage(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (message.startsWith('Species mismatch:')) return 'Approval failed: proposed species conflicts with the matched catalog species. Correct the proposed species or catalog match.';
  if (message.startsWith('Proposed catalog species must')) return 'Approval failed: select Reef manta, Oceanic manta, or Unknown for proposed species.';
  if (message.includes('has no resolved catalog match and is not marked noMatch')) {
    return 'Approval failed. Select a catalog match or No Match for every manta.';
  }
  return 'Approval failed. Commit was not confirmed. Review the submission before retrying.';
}

export function getSubmissionIssues(input: {
  date: string; email: string; startTime: string; stopTime: string;
  locationUnknown: boolean; locationId: string; locationName: string; latitude: string; longitude: string;
  standardizeSurvey: string | null; needsTimeReview: boolean;
}): { field: SubmissionField; message: string }[] {
  const issues: { field: SubmissionField; message: string }[] = [];
  // Preserve the existing date/email checks used by Add Sighting.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date.trim())) issues.push({ field: 'date', message: 'Sighting date' });
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) issues.push({ field: 'email', message: 'Email address' });
  issues.push(...getSurveyTimeIssues(input));
  if (input.needsTimeReview) issues.push({ field: 'photoDates', message: MULTI_DATE_REVIEW_MESSAGE });
  const hasNamedLocation = !!(input.locationId.trim() || input.locationName.trim());
  if (!input.locationUnknown && !hasNamedLocation && !locationPoint(input.latitude, input.longitude)) {
    issues.push({ field: 'location', message: 'Location or “Location unknown”' });
  }
  return issues;
}
