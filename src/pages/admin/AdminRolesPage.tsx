import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listManagedUsers, sendManagedUserRecovery, updateManagedUserAccess, type ManagedRole, type ManagedUser } from "@/lib/adminUserManagementApi";

function toHST(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-US", { timeZone: "Pacific/Honolulu" });
}

function reasonFor(summary: string): string | null {
  const reason = window.prompt(`${summary}\n\nEnter an audit reason (required):`)?.trim() ?? "";
  if (reason.length < 3) {
    if (reason) window.alert("The audit reason must be at least 3 characters.");
    return null;
  }
  return reason;
}

export default function AdminRolesPage() {
  const [rows, setRows] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await listManagedUsers()); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to load users."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function changeAccess(row: ManagedUser, role: ManagedRole, isActive: boolean) {
    if (row.needs_reconciliation) return;
    const summary = role !== row.application_role ? `Change role to ${role}?` : isActive ? "Reactivate account?" : "Suspend account?";
    const reason = reasonFor(summary);
    if (!reason || !window.confirm(`${summary}\n\nReason: ${reason}`)) return;
    setBusyId(row.id); setError(null); setNotice(null);
    try {
      await updateManagedUserAccess({ targetId: row.id, role, isActive, reason });
      setNotice("Application access updated.");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Access update failed."); }
    finally { setBusyId(null); }
  }

  async function recover(row: ManagedUser) {
    const reason = reasonFor("Send this user a password-recovery email?");
    if (!reason || !window.confirm(`Send a recovery email?\n\nReason: ${reason}`)) return;
    setBusyId(row.id); setError(null); setNotice(null);
    try {
      await sendManagedUserRecovery({ targetId: row.id, reason });
      setNotice("Recovery email requested. No password or recovery link was exposed.");
    } catch (err) { setError(err instanceof Error ? err.message : "Recovery request failed."); }
    finally { setBusyId(null); }
  }

  return <div className="p-6">
    <div className="mb-4 flex items-center justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">User Access</h1><p className="text-sm text-slate-600">Auth status and application access are managed separately.</p></div>
      <Link to="/admin/users-invite" className="text-sky-700 hover:underline">Invite user</Link>
    </div>
    {loading && <div role="status" className="text-gray-600">Loading users…</div>}
    {error && <div role="alert" className="mb-3 rounded border border-red-300 bg-red-50 p-3 text-red-700">{error}</div>}
    {notice && <div role="status" className="mb-3 rounded border border-green-300 bg-green-50 p-3 text-green-800">{notice}</div>}
    {!loading && rows.length === 0 && !error && <div className="text-gray-600">No users found.</div>}
    {!loading && rows.length > 0 && <div className="overflow-x-auto rounded border"><table className="min-w-full border-collapse text-sm">
      <thead className="bg-gray-50"><tr className="text-left text-gray-600"><th className="p-3 border-b">User</th><th className="p-3 border-b">Auth account</th><th className="p-3 border-b">Application role</th><th className="p-3 border-b">Application status</th><th className="p-3 border-b">Created</th><th className="p-3 border-b text-right">Actions</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id} className={row.needs_reconciliation ? "bg-amber-50" : ""}>
        <td className="p-3 border-b"><div className="font-medium">{row.display_name || "Unnamed user"}</div><div className="text-slate-600">{row.email}</div></td>
        <td className="p-3 border-b capitalize">{row.auth_status}</td>
        <td className="p-3 border-b">{row.needs_reconciliation ? "—" : <select aria-label={`Role for ${row.email}`} className="rounded border px-2 py-1" value={row.application_role ?? "user"} disabled={busyId === row.id} onChange={(event) => void changeAccess(row, event.target.value as ManagedRole, row.application_active === true)}><option value="user">user</option><option value="admin">admin</option></select>}</td>
        <td className="p-3 border-b">{row.needs_reconciliation ? <span className="font-medium text-amber-800">Needs reconciliation</span> : row.application_active ? "Active" : "Suspended"}</td>
        <td className="p-3 border-b">{toHST(row.created_at)}</td>
        <td className="p-3 border-b"><div className="flex justify-end gap-2">{!row.needs_reconciliation && <button className="rounded border px-2 py-1 disabled:opacity-50" disabled={busyId === row.id} onClick={() => void changeAccess(row, row.application_role ?? "user", !row.application_active)}>{row.application_active ? "Suspend" : "Reactivate"}</button>}<button className="rounded border px-2 py-1 disabled:opacity-50" disabled={busyId === row.id || row.auth_status === "banned"} onClick={() => void recover(row)}>Send recovery</button></div></td>
      </tr>)}</tbody>
    </table></div>}
    <p className="mt-4 text-xs text-slate-500">Permanent deletion is intentionally unavailable. Accounts without profiles require a separate reviewed reconciliation.</p>
  </div>;
}
