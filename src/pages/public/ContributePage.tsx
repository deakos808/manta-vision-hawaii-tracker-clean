import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '@supabase/auth-helpers-react';
import { supabase } from '@/lib/supabase';
import example from '@/assets/manta-orientation-example.jpg';
import { REGIONS, PHOTO_COUNTS, validateAccessRequest } from '../../../supabase/functions/request-contributor-access/contract';

const field = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-200';
export default function ContributePage() {
  const user = useUser();
  const [busy, setBusy] = useState(false);
  const [received, setReceived] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = new FormData(event.currentTarget);
    const body = { fullName: form.get('fullName'), email: form.get('email'), organization: form.get('organization'),
      regions: form.getAll('regions'), photoCountRange: form.get('photoCountRange'), earliestYear: form.get('earliestYear'),
      experienceNotes: form.get('experienceNotes'), website: form.get('website'), ownsPhotos: form.has('ownsPhotos'),
      reliableDetails: form.has('reliableDetails'), acceptsReview: form.has('acceptsReview') };
    const result = validateAccessRequest(body);
    if (result.kind === 'invalid') { setError(result.message); return; }
    inFlight.current = true; setBusy(true); setError('');
    try {
      const { data, error: failure } = await supabase.functions.invoke('request-contributor-access', { body });
      if (failure || data?.success !== true) throw new Error('Request failed');
      setReceived(true);
    } catch { setError('Your request could not be received right now. Please try again later.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="min-h-screen bg-slate-50 text-slate-800">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-5">
      <span className="flex items-center gap-2 font-bold text-sky-800"><img src="/manta-logo.svg" alt="" className="h-9 w-9" />Hawaiʻi Manta Tracker</span>
      <Link to="/signin" className="text-sm text-sky-800 underline">Already have access? Sign in</Link>
    </div></header>
    <main className="mx-auto max-w-5xl px-5 py-8 sm:py-12">
      {user && <Link to="/dashboard" className="mb-6 block text-sm text-sky-800 underline">Already a contributor? Go to Dashboard</Link>}
      {received ? <section role="status" className="mx-auto max-w-xl rounded-2xl border border-teal-200 bg-white p-6 shadow-sm sm:p-10">
        <h1 className="text-3xl font-bold text-sky-900">Request received</h1>
        <p className="mt-4">Thanks for your interest in contributing to the Hawaiʻi Manta Tracker.</p>
        <p className="mt-4">HAMER reviews contributor requests before issuing accounts. If your request is approved, you'll receive an email invitation to create your password.</p>
        <Link to="/signin" className="mt-6 inline-block text-sky-800 underline">Already have an account? Sign in</Link>
      </section> : <>
        <section className="grid items-center gap-6 md:grid-cols-[1fr_220px]">
          <div><p className="text-sm font-semibold uppercase tracking-widest text-teal-700">Photographs become evidence</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight text-sky-950 sm:text-4xl">Contribute to the Hawaiʻi Manta Tracker</h1>
            <p className="mt-5 text-xl text-sky-800">You may already be holding a piece of Hawaiʻi manta history.</p>
            <div className="mt-5 rounded-xl border-l-4 border-teal-600 bg-teal-50 p-4">
              <h2 className="font-bold text-teal-950">Old manta photos are especially valuable.</h2>
              <p className="mt-2 text-sm leading-relaxed">A clear ventral photograph from years ago can extend an individual manta’s known history by a decade or more — helping us understand longevity, movements and changes through time.</p>
            </div>
            <p className="mt-4 leading-relaxed">HAMER is inviting photographers, divers, snorkelers, researchers, dive professionals, residents and visitors to contribute clear ventral photographs from <strong>Maui Nui, Oʻahu, and Kauaʻi / Niʻihau</strong>.</p>
            <p className="mt-3 leading-relaxed">Archival images may also reveal site use, previously unknown resightings, or new individuals. Not every photograph can be accepted or identified.</p>
          </div>
          <figure className="mx-auto w-full max-w-[220px] rounded-2xl border bg-white p-4"><img src={example} alt="A manta's underside showing its identifying spot pattern" className="h-48 w-full object-contain" /><figcaption className="mt-2 text-center text-xs text-slate-500">A clear underside spot pattern helps identify a manta.</figcaption></figure>
        </section>
        <aside className="my-7 rounded-xl border-l-4 border-teal-600 bg-teal-50 p-5">
          <h2 className="font-bold text-teal-950">Photographed a manta on the Big Island?</h2>
          <p className="mt-2 text-sm leading-relaxed">Big Island manta identification/cataloging is managed by the Manta Pacific Research Foundation (MPRF).</p>
          <a href="https://www.mprf.net/identification/report-a-sighting.html" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-medium text-teal-900 underline">Report a Big Island sighting to MPRF ↗</a>
        </aside>
        <div className="grid gap-6 md:grid-cols-2">
          <section><h2 className="text-lg font-bold text-sky-950">What makes a useful MantaTracker photograph?</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed"><li>Clear ventral/underside spot pattern</li><li>Reliable date and location; time when available</li><li>Preferably the original photograph/file</li></ul>
            <p className="mt-3 text-sm leading-relaxed">Photographers should submit their own images whenever possible so HAMER can follow up about sighting details, image provenance, and photo ownership/permission.</p>
          </section>
          <section><h2 className="text-lg font-bold text-sky-950">What approved contributors can do</h2>
            <p className="mt-3 text-sm leading-relaxed">Submit photo-first sightings, use available metadata to speed entry, rotate/crop photos, compare catalog individuals and suggest identifications, track contributions, retain photo credit, and potentially name a newly cataloged individual.</p>
            <p className="mt-3 text-sm font-medium">Final catalog identification and scientific acceptance are reviewed by HAMER.</p>
          </section>
        </div>
        <section className="mt-9 rounded-2xl border bg-white p-5 shadow-sm sm:p-8">
          <h2 className="text-2xl font-bold text-sky-950">Request contributor access</h2>
          <p className="mt-2 text-sm text-slate-600">No photos or password needed here. This request does not automatically create an account. HAMER reviews applications before inviting contributors.</p>
          <form onSubmit={submit} className="mt-6 space-y-5">
            <fieldset disabled={busy} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">Full name (required)<input name="fullName" required maxLength={120} autoComplete="name" className={field} /></label>
                <label className="block text-sm font-medium">Email (required)<input name="email" type="email" required maxLength={254} autoComplete="email" className={field} /></label></div>
              <label className="block text-sm font-medium">Organization / dive operation / affiliation (optional)<input name="organization" maxLength={200} autoComplete="organization" className={field} /></label>
              <fieldset><legend className="text-sm font-medium">Regions represented (choose at least one)</legend><div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">{REGIONS.map(region => <label key={region} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="regions" value={region} className="h-5 w-5 accent-sky-700" />{region}</label>)}</div></fieldset>
              <div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">Approximate sightings / usable ventral photos (optional)<select name="photoCountRange" className={field} defaultValue=""><option value="">Not specified</option>{PHOTO_COUNTS.map(count => <option key={count}>{count}</option>)}</select></label>
                <label className="block text-sm font-medium">Earliest year in your archive (optional)<input name="earliestYear" type="number" min={1826} max={new Date().getFullYear()} step={1} inputMode="numeric" className={field} /></label></div>
              <label className="block text-sm font-medium">Your manta experience / photo collection (optional)<textarea name="experienceNotes" maxLength={2000} rows={4} className={field} /><span className="mt-1 block text-xs text-slate-500">Plain text, up to 2,000 characters.</span></label>
              <div className="hidden" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
              <fieldset className="space-y-3 border-t pt-4"><legend className="text-sm font-medium">Please confirm (all required)</legend>
                {([['ownsPhotos', 'I took these photographs or have permission to contribute them.'], ['reliableDetails', 'I can provide reliable date and location information for the photographs I submit.'], ['acceptsReview', 'I understand that requests and submitted sightings are reviewed for data quality and scientific validity before inclusion in MantaTracker.']] as const).map(([name, label]) => <label key={name} className="flex min-h-11 items-start gap-3 py-1 text-sm leading-relaxed"><input name={name} type="checkbox" required className="mt-1 h-5 w-5 shrink-0 accent-sky-700" />{label}</label>)}
              </fieldset>
            </fieldset>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-lg bg-sky-700 px-6 py-3 font-semibold text-white hover:bg-sky-800 disabled:opacity-60 sm:w-auto">{busy ? 'Sending request…' : 'Request Contributor Access'}</button>
            <p className="text-xs leading-relaxed text-slate-500">Photographs remain credited to the photographer. Submit only images you took or have permission to contribute. Scientific records are reviewed before permanent inclusion.</p>
          </form>
        </section>
      </>}
    </main>
  </div>;
}
