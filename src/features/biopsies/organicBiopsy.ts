export type OrganicBiopsyDraft = {
  collected: true;
  sampleDate: string;
  sampleTime?: string;
  collector: string;
  method: string;
  tissueType: string;
  sampleId?: string;
  labId?: string;
  notes?: string;
};

export function newOrganicBiopsy(sampleDate = ""): OrganicBiopsyDraft {
  return {
    collected: true,
    sampleDate,
    collector: "",
    method: "",
    tissueType: "",
  };
}

export function validateOrganicBiopsy(
  biopsy: OrganicBiopsyDraft | null | undefined,
): string | null {
  if (!biopsy) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(biopsy.sampleDate.trim())) {
    return "Sample date is required.";
  }
  if (biopsy.sampleTime && !/^\d{2}:\d{2}(?::\d{2})?$/.test(biopsy.sampleTime.trim())) {
    return "Sample time is invalid.";
  }
  if (!biopsy.collector.trim()) return "Collector is required.";
  if (!biopsy.method.trim()) return "Collection method is required.";
  if (!biopsy.tissueType.trim()) return "Tissue type is required.";
  return null;
}

export function hasOrganicBiopsies(
  mantas: Array<{ biopsy?: OrganicBiopsyDraft | null }>,
): boolean {
  return mantas.some((manta) => Boolean(manta.biopsy?.collected));
}
