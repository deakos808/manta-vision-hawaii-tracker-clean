import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '@supabase/auth-helpers-react';
import Layout from '@/components/layout/Layout';
import { supabase } from '@/lib/supabase';
import { contributorInviteLink } from '@/features/contributors/invitePrefill';
import type { AccessRequest } from '../../../supabase/functions/request-contributor-access/contract';
type Row = AccessRequest & { id: string; created_at: string; status: string; reviewed_at: string | null; reviewed_by: string | null; admin_notes: string | null };
const PAGE_SIZE = 50;
export default function ContributorRequestsPage() {
  const user = useUser();
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Row | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setSelected(null);
    void (async () => {
      try {
        const { data, error: failure } = await supabase.from('contributor_access_requests').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (cancelled) return;
        if (failure) throw failure;
        setRows((data ?? []) as Row[]);
      } catch { if (!cancelled) { setRows([]); setError('Unable to load requests. Check administrator access and whether the request migration is deployed.'); } }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [page]);
  async function updateStatus(status: 'reviewed' | 'declined' | 'invited') {
    if (!selected || !user || busy) return;
    setBusy(true); setError('');
    try {
      const { data, error: failure } = await supabase.from('contributor_access_requests').update({ status, admin_notes: notes.trim() || null, reviewed_at: new Date().toISOString(), reviewed_by: user.id }).eq('id', selected.id).select('*').single();
      if (failure || !data) throw new Error('Not saved');
      const updated = data as Row;
      setRows(previous => previous.map(row => row.id === updated.id ? updated : row)); setSelected(updated);
    } catch { setError('Request status was not saved. Please try again.'); }
    finally { setBusy(false); }
  }
  return <Layout><main className="mx-auto max-w-5xl px-4 py-6">
    <Link to="/admin" className="text-sm text-sky-700 underline">← Admin</Link>
    <h1 className="mt-4 text-2xl font-bold">Contributor access requests</h1>
    <p className="mt-2 text-sm text-slate-600">Review legitimacy before using the existing Invite User workflow. Opening an invitation does not send it or change request status. Mark Invited manually after a successful invitation.</p>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {loading ? <p role="status" className="py-6">Loading requests…</p> : <div className="mt-5 grid gap-3">
      {!rows.length && !error && <p>No requests yet.</p>}
      {rows.map(row => <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4">
        <div className="min-w-0 break-words"><p className="font-semibold">{row.full_name}</p><p className="break-all text-sm">{row.email}</p><p className="mt-1 text-xs text-slate-600">{new Date(row.created_at).toLocaleDateString()} · {row.regions.join(', ')} · Photos: {row.photo_count_range ?? '—'} · Earliest year: {row.earliest_year ?? '—'}</p></div>
        <div className="flex items-center gap-3 text-sm"><span className="rounded bg-slate-100 px-2 py-1">{row.status}</span><button className="rounded border px-3 py-2 text-sky-800" disabled={busy} onClick={() => { setSelected(row); setNotes(row.admin_notes ?? ''); setError(''); }}>Review<span className="sr-only"> {row.full_name}</span></button></div>
      </article>)}
      <div className="flex justify-between gap-3"><button disabled={page === 0 || busy} className="rounded border px-3 py-2 disabled:opacity-40" onClick={() => setPage(p => p - 1)}>Previous</button><button disabled={rows.length < PAGE_SIZE || busy} className="rounded border px-3 py-2 disabled:opacity-40" onClick={() => setPage(p => p + 1)}>Next</button></div>
    </div>}
    {selected && <section className="mt-6 rounded-xl border border-sky-300 bg-white p-5" aria-label="Request review">
      <h2 className="text-xl font-semibold">Review {selected.full_name}</h2>
      <dl className="mt-4 grid gap-3 text-sm">{[['Email', selected.email], ['Organization', selected.organization], ['Regions', selected.regions.join(', ')], ['Photos', selected.photo_count_range], ['Earliest year', selected.earliest_year], ['Experience / notes', selected.experience_notes], ['Status', selected.status], ['Reviewed', selected.reviewed_at ? new Date(selected.reviewed_at).toLocaleString() : null]].map(([label, value]) => <div key={String(label)}><dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap break-words">{value ?? '—'}</dd></div>)}</dl>
      <label className="mt-4 block text-sm font-medium">Admin notes<textarea className="mt-1 w-full rounded border p-2" rows={3} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} disabled={busy} /></label>
      <div className="mt-4 flex flex-wrap gap-3">
        <button disabled={busy} onClick={() => updateStatus('reviewed')} className="rounded border px-3 py-2">Mark reviewed</button>
        <button disabled={busy} onClick={() => updateStatus('declined')} className="rounded border px-3 py-2">Mark declined</button>
        <button disabled={busy} onClick={() => updateStatus('invited')} className="rounded border px-3 py-2">Mark invited</button>
        {!busy && <Link to={contributorInviteLink(selected)} className="rounded bg-sky-700 px-3 py-2 text-white">Invite contributor</Link>}
      </div>
    </section>}
  </main></Layout>;
}
