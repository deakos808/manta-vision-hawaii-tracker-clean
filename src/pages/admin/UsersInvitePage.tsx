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

export default function UsersInvitePage() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [name, setName] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const submittedEmail = email.trim().toLowerCase();
    if (!submittedEmail) {
      alert("Please enter an email.");
      return;
    }

    setBusy(true);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;

      if (!token) {
        alert("You must be signed in as an admin to invite users.");
        return;
      }

      const r = await fetch(`${EDGE_BASE}/admin-create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: submittedEmail,
          role,
          name: name.trim(),
          sendEmail,
        }),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        alert(
          `Invite failed (${r.status}): ${j?.error ?? j?.detail ?? "Unknown error"}`
        );
        return;
      }

      const actionLink = j?.action_link ?? null;
      const mode = j?.mode ?? "invite";
      const warning = j?.warning ?? null;
      const detail = j?.detail ?? null;

      if (warning) {
        alert(
          `User created, but email delivery reported a warning.\n\n` +
          `${warning}\n\n` +
          `${detail ? `Provider detail:\n${detail}\n\n` : ""}` +
          `You may need to send the setup link manually:\n\n` +
          `${actionLink ?? "No link returned"}`
        );
      } else if (!sendEmail && actionLink) {
        alert(
          `User prepared successfully.\n\n` +
          `Email: ${submittedEmail}\n` +
          `Mode: ${mode}\n\n` +
          `Copy this setup link and send it securely:\n\n` +
          `${actionLink}`
        );
      } else {
        alert(`User invite prepared successfully for ${submittedEmail}.`);
      }

      setEmail("");
      setRole("user");
      setName("");
      setSendEmail(true);
    } catch (err) {
      console.error("[UsersInvitePage] invite error", err);
      alert("Unexpected error. See console for details.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-4xl px-4 pb-16">
        <div className="mt-6 mb-4 text-sm">
          <Link to="/admin" className="text-blue-600 hover:underline">
            ← Admin Dashboard
          </Link>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Invite User</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create or recover a user account and send a secure set-password link.
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
              <Label htmlFor="name">Name (optional)</Label>
              <Input
                id="name"
                type="text"
                placeholder="User name"
                value={name}
                onChange={(e) => setName(e.target.value)}
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

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
              />
              Send email automatically
            </label>

            <Button type="submit" disabled={busy}>
              {busy ? "Preparing…" : "Create Invite"}
            </Button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
