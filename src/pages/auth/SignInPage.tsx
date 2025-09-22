import { debugSignIn } from "@/lib/authTest";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import toast from "react-hot-toast";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function SignInPage() {
  async function handleForgot() {
    try {
      const emailInput = (document.querySelector("input[type=email]") as HTMLInputElement) || (document.querySelector("input[name=email]") as HTMLInputElement);
      const email = emailInput?.value?.trim().toLowerCase();
      if (!email) { alert("Enter your email, then click Forgot password"); return; }
      const redirectTo = window.location.origin + "/set-password";
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) { console.error(error.message); alert("Could not send reset email. If email isn’t configured yet, ask an admin to generate a reset link."); return; }
      alert("If that address exists, a reset link has been sent.");
    } catch (e) { console.error(e); }
  }
  useEffect(() => { const b = document.getElementById("forgot-btn"); if (b) b.addEventListener("click", handleForgot); return () => { if (b) b.removeEventListener("click", handleForgot); }; }, []);

  const q = useQuery();
  const navigate = useNavigate();
  const urlEmail = (q.get("email") || "").trim().toLowerCase();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Prefill from ?email= or last used email
  useEffect(() => {
    const last = (localStorage.getItem("lastSignInEmail") || "").trim().toLowerCase();
    setEmail(urlEmail || last);
  }, [urlEmail]);

  // If already authenticated, bounce to dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/dashboard", { replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate("/dashboard", { replace: true });
    });
    return () => { sub.subscription.unsubscribe(); };
  }, [navigate]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const creds = { email: email.trim().toLowerCase(), password };
    const { error } = await supabase.auth.signInWithPassword(creds);
    setBusy(false);
    if (error) {
      toast.error(error.message || "Sign in failed");
      return;
    }
    localStorage.setItem("lastSignInEmail", creds.email);
    navigate("/dashboard", { replace: true });
  }

  async function handleResend() {
    const addr = email.trim().toLowerCase();
    if (!addr) { toast.error("Enter your email first."); return; }
    const { error } = await supabase.auth.resend({ type: "signup", email: addr });
    if (error) toast.error(error.message); else toast.success("Confirmation email sent (if required).");
  }

  return (
    <Layout>
      <div className="mx-auto max-w-md p-4">
        <form onSubmit={handleLogin} className="space-y-3 mx-auto max-w-sm border rounded-xl p-6 shadow">
          <h2 className="text-center text-xl font-semibold mb-2">Sign In</h2>
          <Input
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="you@example.org"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Signing in…" : "Sign In"}</Button>
          <> </>
        </form>
      </div>
    </Layout>
  );
}
