import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation() as any;
  const redirectTo = location.state?.redirectTo ?? '/dashboard';

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
    if (!email) { setErrorMsg('Enter your email first'); return; }
    const url = `${window.location.origin}/set-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: url });
    if (error) setErrorMsg(error.message || 'Error sending recovery email');
    else setErrorMsg('Check your email for a password reset link.');
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
          type="button"
          className="text-sm underline text-sky-700"
        >
          Forgot password?
        </button>
      </form>
    </div>
  );
}
