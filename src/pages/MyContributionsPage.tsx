import React from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@supabase/auth-helpers-react';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/layout/Layout';
import { supabase } from '@/lib/supabase';
import { loadContributions } from '@/features/sightings/contributions';

function displayDate(value: string | null): string {
  if (!value) return '—';
  // Sighting dates are calendar dates, not UTC instants.
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function MyContributionsPage() {
  const userId = useSession()?.user.id;
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['my-contributions', userId],
    queryFn: () => loadContributions(supabase, userId!),
    enabled: !!userId,
    gcTime: 0,
  });
  return <Layout>
    <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-sky-800">My Contributions</h1>
      {isPending ? <p role="status">Loading your contributions…</p> : isError ?
        <div role="alert" className="rounded border p-4">
          <p>Unable to load your contribution history. Please try again later.</p>
          <button type="button" className="text-sky-700 underline mt-2" onClick={() => void refetch()}>Try again</button>
        </div> : data && <>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[['Total contributions', data.total], ['Most recent contribution', displayDate(data.latest)], ['Pending submissions', data.pending]].map(([label, value]) =>
              <div key={label} className="rounded-lg border bg-slate-50 p-4"><dt className="text-sm text-slate-600">{label}</dt><dd className="text-xl font-semibold mt-1">{value}</dd></div>)}
          </dl>
          {data.total === 0 ? <div className="rounded-lg border p-6 text-center">
            <p>No contributions yet.</p>
            <Link to="/sightings/add" className="inline-block mt-3 rounded bg-sky-700 text-white px-4 py-3">Add New Sighting</Link>
          </div> : <ul className="space-y-3">
            {data.items.map(item => <li key={item.key} className="rounded-lg border p-4 space-y-2 break-words">
              <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{displayDate(item.date)}</h2><span className="rounded bg-slate-100 px-2 py-1 text-sm">{item.status}</span></div>
              <p>{item.location}</p>
              <p className="text-sm text-slate-600">{[item.mantas != null ? `${item.mantas} mantas` : null, item.photos != null ? `${item.photos} photos` : null].filter(Boolean).join(' · ')}</p>
              {item.submittedAt && <p className="text-xs text-slate-500">Submitted: {new Date(item.submittedAt).toLocaleString()}</p>}
              {item.rejectReason && <p className="text-sm whitespace-pre-wrap">Reason: {item.rejectReason}</p>}
            </li>)}
          </ul>}
        </>}
    </main>
  </Layout>;
}
