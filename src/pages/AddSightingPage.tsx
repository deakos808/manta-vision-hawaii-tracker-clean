import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';

import React, { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";

import MatchModal from "@/components/mantas/MatchModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import UnifiedMantaModal, { type MantaDraft } from "@/components/mantas/UnifiedMantaModal";
import MantasList from "@/components/mantas/MantasList";
import { supabase } from "@/lib/supabase";
import TempSightingMap from "@/components/map/TempSightingMap";

import { createClient } from '@supabase/supabase-js';

// ---- Supabase client fallback (module-local) ----
declare global { interface Window { supabase?: any; __mantas?: any[] } }
const supabase: any = (globalThis as any).supabase ?? createClient(
  (import.meta as any).env.VITE_SUPABASE_URL as string,
  (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string
);
// -----------------------------------------------


function genId(){ try { return (crypto as any).randomUUID(); } catch { return Math.random().toString(36).slice(2); } }
function buildTimes(stepMin=5){ const out:string[]=[]; for(let h=0;h<24;h++){ for(let m=0;m<60;m+=stepMin){ out.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);} } return out; }
const TIME_OPTIONS = buildTimes(5);

// helpers
const useTotalPhotos = (mantas:any[]) => (mantas ?? []).reduce((n,m:any)=> n + (Array.isArray(m?.photos) ? m.photos.length : 0), 0);
type LocRec = { id: string; name: string; island?: string; latitude?: number|null; longitude?: number|null };

export default function AddSightingPage() {
  // REVIEW FLAGS HOOK (minimal)
  const [searchParams] = useSearchParams();



  async function handleSave(e?: any) {
    try { e?.preventDefault?.(); } catch {}
    if (!isReview || !reviewId) { alert('Not in review mode'); return; }
    try {
      await saveReviewServer(reviewId as string);
      console.info('[Save Changes] payload persisted for review', reviewId);
      if (typeof window !== 'undefined' && (window as any).toast?.success) (window as any).toast.success('Saved!');
      else alert('Saved ✓');
    } catch (err) {
      console.error('Save failed', err);
      if (typeof window !== 'undefined' && (window as any).toast?.error) (window as any).toast.error('Save failed');
      else alert('Save failed');
    }
  }

  // Wire up "Save Changes" click if JSX isn't already bound (idempotent)
  useEffect(() => {
    if (!isReview) return;
    const handler = (ev: Event) => { ev.preventDefault(); handleSave(); };
    const sel = ['button', '[role="button"]'];
    const isSave = (el: Element) => /save\s*changes/i.test(el.textContent || '');
    const attach = () => {
      const candidates = Array.from(document.querySelectorAll(sel.join(','))).filter(isSave) as HTMLElement[];
      for (const btn of candidates) {
        if ((btn as any).__saveHooked) continue;
        btn.addEventListener('click', handler, { capture: true });
        (btn as any).__saveHooked = true;
      }
    };
    const mo = new MutationObserver(attach);
    attach();
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      const candidates = Array.from(document.querySelectorAll(sel.join(','))).filter(isSave) as HTMLElement[];
      for (const btn of candidates) {
        if ((btn as any).__saveHooked) {
          btn.removeEventListener('click', handler, { capture: true } as any);
          delete (btn as any).__saveHooked;
        }
      }
    };
  }, [isReview, reviewId]); // SAVE_CHANGES_WIRING

