// File: src/components/layout/Layout.tsx
import React from 'react';
import Header from '@/components/layout/Header';
import { useUserRole } from '@/hooks/useUserRole';
import { useUser } from '@supabase/auth-helpers-react';

import MantasSummaryDock from "@/components/sightings/MantasSummaryDock";
/*
  The generated constants live in <repo-root>/generated/version.ts
  ‣ This path is OUTSIDE src/, so nodemon ignores it and no restart loop occurs.
  ‣ Use a relative import that walks three levels up, then into generated/.
     src/components/layout/Layout.tsx  ➜  ../../../generated/version.ts
*/
import { DEPLOYED_AT, GIT_HASH } from '../../../generated/version';

// ── helper: ISO → Hawaii-time string ───────────────────────
function toHST(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? 'Unknown'
    : d.toLocaleString('en-US', {
        timeZone: 'Pacific/Honolulu',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
      });
}

type Props = { children: React.ReactNode };

export default function Layout({ children }: Props) {
  const { role } = useUserRole();
  const user    = useUser();

  return (<>
<div className="flex flex-col min-h-screen bg-white text-black">
      <Header />
      <main className="flex-grow px-4 py-6">{children}</main>

      <footer className="text-sm text-gray-600 text-center p-4 border-t">
        <div>
          Signed in as:&nbsp;
          <strong>{user?.email ?? 'Unknown User'}</strong>&nbsp;
          <em>({role ?? 'no-role'})</em>
        </div>
        <div>
          Code version&nbsp;(HST):&nbsp;
          <strong>{toHST(DEPLOYED_AT)}</strong>&nbsp;—&nbsp;{GIT_HASH}<br /><small className="text-xs text-gray-500">BUILD: manta-vision-hawaii-tracker-clean</small>
        </div>
      </footer>
    </div>
  
<MantasSummaryDock />
</>);
}
