import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { Link } from "react-router-dom";

const EDGE_BASE =
  (import.meta.env.VITE_SUPABASE_EDGE_URL?.replace(/\/$/, "")) ||
  ((import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "") + "/functions/v1") ||
  "https://apweteosdbgsolmvcmhn.supabase.co/functions/v1";

function genTempPassword(len = 20) {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_!@#$%^&*";
  const out: string[] = [];
  const rnd = new Uint32Array(len);
  (window.crypto || self.crypto).getRandomValues(rnd);
  for (let i = 0; i < len; i++) out.push(abc[rnd[i] % abc.length]);
  return out.join("");
}

export default function UsersInvitePage() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const em = email.trim();
    if (!em) { alert("Please enter an email."); return; }

    // use provided password or generate one
    let pw = password.trim();
    if (!pw) pw = genTempPassword(20);

    setBusy(true);
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes?.user?.id) { alert("Cannot determine admin user id."); return; }
      const admin_id = userRes.user.id;

      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;

      const r = await fetch(`${EDGE_BASE}/create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          email: em,
          password: pw,
          role,
          admin_id,
        }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(`Invite failed (${r.status}): ${j?.error ?? "Unknown error"}`);
        return;
      }

      // ✅ success — show the password ONCE so you can copy/paste to the user
      alert(`Invite created.\n\nEmail: ${em}\nTemporary password:\n${pw}\n\nPlease copy this now and share it securely with the user.`);
      setEmail("");
      setPassword("");
    } catch (err) {
      console.error("[invite] error", err);
      alert("Unexpected error. See console for details.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout title="Invite Users">
      <div className="mx-auto max-w-4xl px-4 pb-16">
        <div className="mt-6 mb-4 text-sm">
          <Link to="/admin" className="text-blue-600 hover:underline">← Admin Dashboard</Link>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Invite Admin/User</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create an account, set a password, and share the credentials with the user.
          </p>

          <form className="mt-4 grid gap-4 max-w-lg" onSubmit={onSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                className="h-10 rounded border px-3 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "user")}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>

            <div className="grid gap-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <div className="text-xs text-muted-foreground">
                  (leave blank and we’ll generate)
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  id="password"
                  type={showPw ? "text" : "password"}
                  placeholder="Set a temporary password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={() => setPassword(genTempPassword(16))}>
                  Generate
                </Button>
              </div>
              <label className="mt-1 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
                Show password
              </label>
            </div>

            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Generate Invite"}
            </Button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
