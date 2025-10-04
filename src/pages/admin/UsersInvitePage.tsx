import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import Layout from "@/components/layout/Layout";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import toast from "react-hot-toast";

import ReviewSubmissionsCard from "@/components/admin/ReviewSubmissionsCard";
export default function UsersInvitePage() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [sendEmail, setSendEmail] = useState(false); // default: show link inline
  const [sending, setSending] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [result, setResult] = useState<{ action_link?: string; email?: string; role?: string; mode?: "invite" | "recovery" } | null>(null);

  const EDGE_BASE = (import.meta as any).env.VITE_SUPABASE_EDGE_URL?.replace(/\/$/, "") || "";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessionToken(data.session?.access_token ?? null));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    if (!sessionToken) { toast.error("Not signed in as admin"); return; }
    if (!email || !/\S+@\S+\.\S+/.test(email)) { toast.error("Enter a valid email"); return; }

    setSending(true);
    try {
      const r = await fetch(`${EDGE_BASE}/admin-create-user`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, sendEmail })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok && !j.action_link) {
        console.error("[admin-create-user] status", r.status, "payload:", j);
        toast.error(j?.detail ?? j?.error ?? `Invite failed (${r.status})`);
      } else {
        setResult({ action_link: j.action_link, email: j.email, role: j.role, mode: j.mode });
        toast.success(j.action_link ? (j.mode === "recovery" ? "Recovery link ready" : "Invite link ready") : "Email sent");
      }
    } catch (err: any) {
      toast.error(String(err?.message || err));
    } finally {
      setSending(false);
    }
  }

  async function copyLink() {
    if (result?.action_link) {
      await navigator.clipboard.writeText(result.action_link);
      toast.success("Invite link copied");
    }
  }

  return (<Layout>
  <ReviewSubmissionsCard />
      <div className="mx-auto max-w-xl p-4">
        <div className="mb-3 text-sm text-muted-foreground">
          <Link to="/admin" className="hover:underline">← Admin Dashboard</Link>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Invite Admin/User</CardTitle>
            <CardDescription>Create an account and send an invite link or email.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="person@example.org" />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v: any) => setRole(v)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">user</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
                Send email via Resend (otherwise just show invite/recovery link)
              </label>
              <Button type="submit" disabled={sending} className="w-full">{sending ? "Sending..." : "Generate Invite"}</Button>
            </form>

            {result?.action_link && (
              <div className="mt-6 rounded-lg border p-3 text-sm space-y-2">
                <div className="font-medium">
                  {result.mode === "recovery" ? "Recovery link" : "Invite link"} (copy & share):
                </div>
                <div className="truncate">{result.action_link}</div>
                <Button variant="outline" className="w-full" onClick={copyLink}>Copy Link</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
