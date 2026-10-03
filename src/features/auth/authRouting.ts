export type AuthRouteDecision = "pending" | "authenticated" | "anonymous";

export type UserAccessState =
  | "loading"
  | "signed_out"
  | "admin"
  | "user"
  | "inactive"
  | "missing_profile"
  | "error";

export type ProtectedRouteDecision =
  | "pending"
  | "signin"
  | "allow"
  | "unauthorized"
  | "inactive"
  | "missing_profile"
  | "error";

export function getAuthRouteDecision(isLoading: boolean, hasSession: boolean): AuthRouteDecision {
  if (isLoading) return "pending";
  return hasSession ? "authenticated" : "anonymous";
}

export function shouldShowSignedInIdentity(isLoading: boolean, email: string | null | undefined): boolean {
  return !isLoading && Boolean(email);
}

export function getProtectedRouteDecision(
  state: UserAccessState,
  adminOnly: boolean,
): ProtectedRouteDecision {
  if (state === "loading") return "pending";
  if (state === "signed_out") return "signin";
  if (state === "inactive" || state === "missing_profile" || state === "error") return state;
  if (adminOnly && state !== "admin") return "unauthorized";
  return "allow";
}

export function safeInternalRedirect(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
