import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { safeInternalRedirect } from '@/features/auth/authRouting';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resetNotice, setResetNotice] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = safeInternalRedirect((location.state as { redirectTo?: string } | null)?.redirectTo);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setErrorMsg(error.message || 'Invalid login credentials');
      return;
    }
    navigate(redirectTo, { replace: true });
  }

  async function handleReset(e: React.MouseEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setResetNotice(false);
    if (!email) { setErrorMsg('Enter your email first'); return; }
    setResetBusy(true);
    try {
      const url = `${window.location.origin}/set-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: url });
      // Never display provider messages that could disclose account existence.
      if (error) setErrorMsg('Unable to process the reset request right now. Please try again later or contact HAMER administration.');
      else setResetNotice(true);
    } catch {
      setErrorMsg('Unable to process the reset request right now. Please try again later or contact HAMER administration.');
    } finally { setResetBusy(false); }
  }

  return (
    <div className="p-6 flex justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-3">
        <h1 className="text-xl font-semibold mb-2">Sign In</h1>

        <input
          type="email"
          autoComplete="email"
          className="w-full border rounded px-3 py-2"
          placeholder="email@domain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          autoComplete="current-password"
          className="w-full border rounded px-3 py-2"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {resetNotice && <div role="status" className="rounded border bg-slate-50 p-3 text-sm space-y-2">
          <p className="font-semibold">Check your email</p>
          <p>If an active MantaTracker account exists for this email, we'll send a password-reset link.</p>
          <p>If you don't receive it within a few minutes, check your spam or junk folder. If you previously used a different login, or you're unsure which email is registered, please contact HAMER administration for access.</p>
        </div>}
        {errorMsg && <div className="text-red-600 text-sm">{errorMsg}</div>}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-sky-600 text-white px-3 py-2 rounded disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign In'}
        </button>

        <button
          onClick={handleReset}
          disabled={resetBusy}
          type="button"
          className="text-sm underline text-sky-700"
        >
          {resetBusy ? 'Requesting…' : 'Forgot password?'}
        </button>
        <a href="/contribute" className="block text-sm underline text-sky-700">Need contributor access?</a>
      </form>
    </div>
  );
}
