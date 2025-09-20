import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import Layout from "@/components/layout/Layout";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SetPasswordPage() {
  const navigate = useNavigate();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email ?? null;
      setSessionEmail(email);
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!sessionEmail) {
      setMsg({ type: "error", text: "Session missing. Please open your invite/recovery link again." });
      return;
    }
    if (pw1.length < 8) {
      setMsg({ type: "error", text: "Password must be at least 8 characters." });
      return;
    }
    if (pw1 !== pw2) {
      setMsg({ type: "error", text: "Passwords do not match." });
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.auth.updateUser({ password: pw1 });
    setBusy(false);

    if (error) {
      console.error("[set-password] updateUser error:", error);
      setMsg({ type: "error", text: error.message || "Failed to set password" });
      return;
    }

    console.log("[set-password] updateUser ok:", data);
    setMsg({ type: "ok", text: "Password set. Redirecting to sign-in…" });

    // Ensure we don't keep the recovery session around
    await supabase.auth.signOut();

    // Hard redirect to avoid any stale state
    window.location.assign("/signin");
  }

  return (
    <Layout>
      <div className="mx-auto max-w-md p-4">
        <div className="mb-3 text-sm text-muted-foreground">
          <Link to="/" className="hover:underline">← Home</Link>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Set Your Password</CardTitle>
            <CardDescription>
              {sessionEmail
                ? <>Creating a password for <span className="font-medium">{sessionEmail}</span>.</>
                : "Open your invite or recovery link, then set your password."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {msg && (
              <div className={`mb-3 text-sm ${msg.type === "error" ? "text-red-600" : "text-green-700"}`}>
                {msg.text}
              </div>
            )}
            {!sessionEmail && (
              <div className="text-sm text-red-600 mb-3">
                Session not found. Please open your invite/recovery link again.
              </div>
            )}
            <form onSubmit={onSubmit} className="space-y-3">
              <Input type="password" placeholder="New password (min 8 chars)" value={pw1} onChange={e => setPw1(e.target.value)} />
              <Input type="password" placeholder="Confirm password" value={pw2} onChange={e => setPw2(e.target.value)} />
              <Button type="submit" disabled={busy || !sessionEmail} className="w-full">
                {busy ? "Saving..." : "Set Password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
