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

  // Capture recovery tokens from the URL hash and create a session
  useEffect(() => {
    (async () => {
      const hash = window.location.hash || "";
      const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");

      if (access_token && refresh_token) {
        const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) {
          setMsg({ type: "error", text: error.message || "Could not initialize session from link. Please open a fresh invite/recovery link." });
        } else {
          setSessionEmail(data.session?.user?.email ?? null);
        }
      } else {
        const { data } = await supabase.auth.getSession();
        setSessionEmail(data.session?.user?.email ?? null);
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!sessionEmail) {
      setMsg({ type: "error", text: "Session not found. Open your invite/recovery link again, then set your password here." });
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
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setBusy(false);

    if (error) {
      setMsg({ type: "error", text: error.message || "Failed to set password." });
      return;
    }

    setMsg({ type: "ok", text: "Password set! Redirecting to sign in…" });
    await supabase.auth.signOut();
    window.location.assign("/signin?email=" + encodeURIComponent(sessionEmail));
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
              {sessionEmail ? <>Creating a password for <span className="font-medium">{sessionEmail}</span>.</> : "Open your invite or recovery link, then set your password."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {msg && (
              <div className={`mb-3 text-sm ${msg.type === "error" ? "text-red-600" : "text-green-700"}`}>
                {msg.text}
              </div>
            )}
            <form onSubmit={onSubmit} className="space-y-3">
              <Input type="password" placeholder="New password (min 8 chars)" value={pw1} onChange={e => setPw1(e.target.value)} />
              <Input type="password" placeholder="Confirm password" value={pw2} onChange={e => setPw2(e.target.value)} />
              <Button type="submit" disabled={busy} className="w-full">{busy ? "Saving..." : "Set Password"}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
