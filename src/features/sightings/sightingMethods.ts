export type SightingMethods = {
  pairedLaser: boolean;
  biopsySampling: boolean;
  tagDeployment: boolean;
};

// Missing/legacy payloads opt out; never infer methods from scientific data.
export function readSightingMethods(value?: unknown): SightingMethods {
  const methods = value && typeof value === "object"
    ? value as Partial<SightingMethods> : {};
  return {
    pairedLaser: methods.pairedLaser === true,
    biopsySampling: methods.biopsySampling === true,
    tagDeployment: methods.tagDeployment === true,
  };
}
