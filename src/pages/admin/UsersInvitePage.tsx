import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteManagedUser, checkHistoricalContributions, type HistoryCandidate } from "@/lib/adminUserManagementApi";

export default function UsersInvitePage() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [candidate, setCandidate] = useState<HistoryCandidate | null>(null);
  const [linkHistory, setLinkHistory] = useState(false);
  const [checking, setChecking] = useState(false);
  const lookupVersion = useRef(0);

  async function checkHistory() {
    const version = ++lookupVersion.current;
    setChecking(true); setCandidate(null); setLinkHistory(false); setError(null);
    try {
      const result = await checkHistoricalContributions(displayName);
      if (version === lookupVersion.current) setCandidate(result.candidate);
    } catch (err) {
      if (version === lookupVersion.current) setError(err instanceof Error ? err.message : "Historical lookup failed.");
    } finally { if (version === lookupVersion.current) setChecking(false); }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault(); setError(null); setMessage(null);
    if (reason.trim().length < 3) { setError("An audit reason of at least 3 characters is required."); return; }
    if (!window.confirm("Invite this person as a regular user?")) return;
    setBusy(true);
    try {
      const result = await inviteManagedUser({ email: email.trim().toLowerCase(), displayName: displayName.trim(), reason: reason.trim(),
        ...(linkHistory && candidate?.status === "eligible" ? { legacyPhotographerAlias: candidate.alias } : {}) });
      setMessage(result.warning ?? (result.historical_linked ? "Invitation sent and historical contributions linked." : "Invitation requested. The invited person will establish their own password by email."));
      setEmail(""); setDisplayName(""); setReason(""); setCandidate(null); setLinkHistory(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Invitation failed."); }
    finally { setBusy(false); }
  }

  return <Layout><div className="mx-auto max-w-4xl px-4 pb-16">
    <div className="mt-6 mb-4 text-sm"><Link to="/admin/roles" className="text-blue-600 hover:underline">← User access</Link></div>
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold">Invite user</h1>
      <p className="mt-1 text-sm text-muted-foreground">Invitations default to a regular user. Manta Tracker never assigns or displays the person’s password.</p>
      {error && <div role="alert" className="mt-4 text-sm text-red-700">{error}</div>}
      {message && <div role="status" className="mt-4 text-sm text-green-800">{message}</div>}
      <form className="mt-4 grid max-w-lg gap-4" onSubmit={onSubmit}>
        <div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="grid gap-2"><Label htmlFor="display-name">Display name (optional)</Label><Input id="display-name" value={displayName} disabled={busy} onChange={(e) => { setDisplayName(e.target.value); ++lookupVersion.current; setCandidate(null); setLinkHistory(false); setChecking(false); }} /><p className="text-xs text-slate-500">Descriptive metadata only; never used for authorization or historical ownership. Older accounts may show Unnamed user without affecting access.</p></div>
        <div className="grid gap-2 text-sm">
          <Button type="button" variant="outline" disabled={busy || checking || !displayName.trim()} onClick={checkHistory}>{checking ? "Checking…" : "Check historical contributions"}</Button>
          <div aria-live="polite">
            {candidate?.status === "none" && <p>No exact historical photographer match found.</p>}
            {candidate?.status === "ambiguous" && <p>Multiple historical spellings match. Review this identity separately.</p>}
            {candidate?.status === "mapped" && <p>Historical contributions are already linked to another account.</p>}
            {candidate?.status === "eligible" && <div className="rounded border bg-slate-50 p-3 space-y-2">
              <p className="font-medium">Historical contributions found</p>
              <p>Photographer: {candidate.alias}</p>
              <p>Sightings: {candidate.sightings} · Mantas: {candidate.mantas} · Photos: {candidate.photos}</p>
              <p>First: {candidate.first ?? "—"} · Latest: {candidate.latest ?? "—"}</p>
              <label className="flex items-start gap-2"><input type="checkbox" checked={linkHistory} disabled={busy} onChange={e => setLinkHistory(e.target.checked)} />Link these historical contributions to this user</label>
            </div>}
          </div>
        </div>
        <div className="grid gap-1"><Label>Application role</Label><div className="rounded border bg-slate-50 px-3 py-2 text-sm">user</div><p className="text-xs text-slate-500">Promoting a user is a separate, confirmed, audited action after invitation.</p></div>
        <div className="grid gap-2"><Label htmlFor="reason">Reason</Label><Input id="reason" required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <Button type="submit" disabled={busy || checking}>{busy ? "Sending invitation…" : "Send invitation"}</Button>
      </form>
    </div>
  </div></Layout>;
}
