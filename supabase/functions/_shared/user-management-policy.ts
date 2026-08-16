export const USER_MANAGEMENT_ACTIONS = [
  "list",
  "invite",
  "send_recovery",
  "update_access",
] as const;

export type UserManagementAction = typeof USER_MANAGEMENT_ACTIONS[number];
export type ManagedRole = "admin" | "user";

export interface AccessProfile {
  id: string;
  role: string | null;
  is_active: boolean | null;
}

export interface AccessChange {
  role: ManagedRole;
  isActive: boolean;
  reason: string;
}

export function parseAction(value: unknown): UserManagementAction {
  if (typeof value !== "string" || !USER_MANAGEMENT_ACTIONS.includes(value as UserManagementAction)) {
    throw new Error("Unsupported user-management action.");
  }
  return value as UserManagementAction;
}

export function requireActiveAdmin(profile: AccessProfile | null | undefined): AccessProfile {
  if (!profile) throw new Error("The acting account has no application profile.");
  if (profile.is_active !== true) throw new Error("The acting administrator is inactive.");
  if (profile.role !== "admin") throw new Error("Active administrator access is required.");
  return profile;
}

export function parseManagedRole(value: unknown, fallback: ManagedRole = "user"): ManagedRole {
  const role = value == null || value === "" ? fallback : value;
  if (role !== "admin" && role !== "user") throw new Error("Invalid application role.");
  return role;
}

export function planAccessChange(args: {
  actor: AccessProfile;
  target: AccessProfile;
  requestedRole: unknown;
  requestedActive: unknown;
  reason: unknown;
  activeAdminCount: number;
}): AccessChange {
  requireActiveAdmin(args.actor);
  const role = parseManagedRole(args.requestedRole);
  if (typeof args.requestedActive !== "boolean") throw new Error("Active status must be true or false.");
  const reason = typeof args.reason === "string" ? args.reason.trim() : "";
  if (reason.length < 3 || reason.length > 500) throw new Error("A change reason between 3 and 500 characters is required.");

  const removesAdminAccess = args.target.role === "admin" && args.target.is_active === true &&
    (role !== "admin" || args.requestedActive !== true);
  if (args.actor.id === args.target.id && removesAdminAccess) {
    throw new Error("Administrators cannot demote or suspend themselves.");
  }
  if (removesAdminAccess && args.activeAdminCount <= 2) {
    throw new Error("At least two active administrators must remain.");
  }

  return { role, isActive: args.requestedActive, reason };
}
