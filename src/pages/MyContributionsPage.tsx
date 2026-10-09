import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@supabase/auth-helpers-react';
import { useQueries, useQuery } from '@tanstack/react-query';
import Layout from '@/components/layout/Layout';
import { supabase } from '@/lib/supabase';
import { loadContributions } from '@/features/sightings/contributions';
import { CONTRIBUTION_BATCH_SIZE, contributionBatches, loadContributionPage, type PageDetail } from '@/features/sightings/contributionDetails';
import ContributionModals, { type ContributionModal } from '@/features/sightings/ContributionModals';

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
  const [visibleCount, setVisibleCount] = useState(CONTRIBUTION_BATCH_SIZE);
  const [selection,setSelection] = useState<ContributionModal | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const automaticLoading = typeof IntersectionObserver !== 'undefined';
  const visible = contributionBatches(data?.items ?? [], visibleCount);
  // Each appended batch has its own stable query: earlier ranges stay cached.
  const batchDetails = useQueries({ queries: visible.batches.map(batch => ({
    queryKey: ['contribution-page', userId, batch.map(r => r.key)],
    queryFn: () => loadContributionPage(supabase, userId!, batch),
    enabled: !!userId, gcTime: 0, staleTime: Infinity,
  })) });
  const details: Record<string, PageDetail> = Object.assign({}, ...batchDetails.map(query => query.data ?? {}));
  const enrichmentPending = batchDetails.some(query => query.isPending);
  const enrichmentError = batchDetails.some(query => query.isError);

  useEffect(() => {
    setVisibleCount(CONTRIBUTION_BATCH_SIZE);
    setSelection(null);
  }, [userId]);

  useEffect(() => {
    if (!automaticLoading || !visible.hasMore || selection || !sentinel.current) return;
    let advanced = false;
    const observer = new IntersectionObserver(entries => {
      if (advanced || !entries.some(entry => entry.isIntersecting)) return;
      advanced = true;
      observer.disconnect();
      setVisibleCount(count => count + CONTRIBUTION_BATCH_SIZE);
    }, { rootMargin: '0px 0px 300px 0px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [automaticLoading, visible.hasMore, visible.items.length, selection]);
  return <Layout>
    <main className="max-w-7xl min-w-0 w-full mx-auto p-4 sm:p-6 space-y-6">
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
          </div> : <div className="space-y-3 min-w-0">
            <p className="text-sm text-slate-600" role="status">
              {visible.hasMore ? `Showing ${visible.items.length} of ${data.total} contributions` : `Showing all ${data.total} contributions`}
            </p>
            {enrichmentError && <p role="alert" className="text-sm">Photo counts and catalog references could not be loaded. <button className="underline" onClick={() => { batchDetails.filter(query => query.isError).forEach(query => void query.refetch()); }}>Try again</button></p>}
            <div className="max-w-full overflow-x-auto rounded border" role="region" aria-label="Contribution history" tabIndex={0}>
              <table className="w-full min-w-[850px] text-sm text-left"><thead className="bg-slate-50"><tr>{['Date','Island','Location','Mantas','Photos','Catalog','Status','More'].map(h => <th scope="col" className="px-3 py-3 font-medium" key={h}>{h}</th>)}</tr></thead>
                <tbody>{visible.items.map(item => {
                  const extra = details[item.key];
                  const photos = item.source === 'submission' ? item.photos : extra?.photos;
                  const links = extra?.catalog ?? [];
                  return <tr key={item.key} className="border-t align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{displayDate(item.date)}</td><td className="px-3 py-2">{item.island}</td><td className="px-3 py-2 max-w-52 break-words">{item.location}</td><td className="px-3 py-2">{item.mantas ?? '—'}</td>
                    <td className="px-3 py-1 whitespace-nowrap">{photos != null && photos > 0 ? <button className="py-2 text-sky-700 underline" onClick={() => setSelection({kind:'photos',row:item})}>{photos} {photos === 1 ? 'photo' : 'photos'}</button> : photos === 0 ? '0' : '—'}</td>
                    <td className="px-3 py-1 max-w-60">{links.length ? <div className="flex flex-col items-start">{links.slice(0,2).map((c,i) => c.id ? <button key={i} className="py-1 text-sky-700 underline text-left" onClick={() => setSelection({kind:'catalog',id:c.id!})}>{c.label}: {c.name || c.id}</button> : <span key={i} className="py-1">{c.label}</span>)}{links.length>2 && <button className="py-2 text-sky-700 underline" onClick={() => setSelection({kind:'catalog-list',links})}>+{links.length-2} more</button>}</div> : enrichmentPending ? '…' : '—'}</td>
                    <td className="px-3 py-2"><span className="rounded bg-slate-100 px-2 py-1 text-xs">{item.status}</span></td>
                    <td className="px-3 py-1"><button aria-label={`More about ${displayDate(item.date)}`} className="py-2 text-sky-700 underline" onClick={() => setSelection({kind:'more',row:item})}>More</button></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            {visible.hasMore && <div ref={sentinel} className="min-h-4">
              {!automaticLoading && <button className="text-sm text-sky-700 underline py-2" onClick={() => setVisibleCount(count => count + CONTRIBUTION_BATCH_SIZE)}>Load more</button>}
            </div>}
          </div>}
        </>}
    </main>
    {selection && userId && <ContributionModals key={userId} selection={selection} userId={userId} onClose={() => setSelection(null)} onCatalog={id => setSelection({kind:"catalog",id})} />}
  </Layout>;
}
