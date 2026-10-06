import { locationPoint } from "../../components/map/locationSelection";

export type SubmissionField = 'date' | 'email' | 'startTime' | 'stopTime' | 'photoDates' | 'location';
export const MULTI_DATE_REVIEW_MESSAGE = 'Photos span multiple dates. Review the sighting date, Start Time, and Stop Time manually.';

export function getSubmissionIssues(input: {
  date: string; email: string; startTime: string; stopTime: string;
  locationUnknown: boolean; locationId: string; locationName: string; latitude: string; longitude: string;
  standardizeSurvey: string | null; needsTimeReview: boolean;
}): { field: SubmissionField; message: string }[] {
  const issues: { field: SubmissionField; message: string }[] = [];
  // Preserve the existing date/email checks used by Add Sighting.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date.trim())) issues.push({ field: 'date', message: 'Sighting date' });
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) issues.push({ field: 'email', message: 'Email address' });
  if (input.standardizeSurvey === 'Yes') {
    if (!input.startTime.trim()) issues.push({ field: 'startTime', message: 'Start Time' });
    if (!input.stopTime.trim()) issues.push({ field: 'stopTime', message: 'Stop Time' });
  }
  if (input.needsTimeReview) issues.push({ field: 'photoDates', message: MULTI_DATE_REVIEW_MESSAGE });
  const hasNamedLocation = !!(input.locationId.trim() || input.locationName.trim());
  if (!input.locationUnknown && !hasNamedLocation && !locationPoint(input.latitude, input.longitude)) {
    issues.push({ field: 'location', message: 'Location or “Location unknown”' });
  }
  return issues;
}
