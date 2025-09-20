
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface UserRole {
  role: string;
  user_id: string;
}

export function checkUserRole(userRoles: UserRole[] | null, requiredRole: string): boolean {
  if (!userRoles) return false;
  return userRoles.some(role => role.role === requiredRole);
}
