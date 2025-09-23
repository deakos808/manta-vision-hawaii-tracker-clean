import React, { useEffect, useState } from "react";
import Layout from "@/components/layout/Layout";
import { supabase } from "@/lib/supabase";
type Role = "admin" | "user" | null;
type Profile = { id: string; email: string | null; role: Role; created_at?: string };

export default function AdminRolesPage() {
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", role: "user" as "admin" | "user" });

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("profiles").select("id,email,role,created_at").order("email", { ascending: true });
    if (!error && data) setRows(data as Profile[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function setRole(id: string, role: "admin" | "user") {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
    if (!error) await load();
  }

  async function sendReset(email: string | null) {
    if (!email) return;
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/set-password` });
    alert(`Password reset link sent to ${email}`);
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.password) return;
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { emailRedirectTo: `${window.location.origin}/set-password`, data: {} }
    });
    if (error) { alert(error.message); return; }
    const userId = data.user?.id;
    if (userId) {
      await supabase.from("profiles").upsert({ id: userId, email: form.email, role: form.role }, { onConflict: "id" });
      await load();
      setForm({ email: "", password: "", role: "user" });
      alert("User created. If email confirmation is required, they must confirm before signing in.");
    }
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Admin · User Roles</h1>

        <form onSubmit={createUser} className="mb-8 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input className="border rounded px-3 py-2 w-full" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required />
          </div>
          <div>
            <label className="block text-sm mb-1">Temp Password</label>
            <input className="border rounded px-3 py-2 w-full" type="text" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required />
          </div>
          <div>
            <label className="block text-sm mb-1">Role</label>
            <select className="border rounded px-3 py-2 w-full" value={form.role} onChange={e=>setForm({...form,role:e.target.value as "admin"|"user"})}>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <button className="bg-blue-600 text-white rounded px-4 py-2 h-[38px]" type="submit">Create User</button>
        </form>

        <div className="border rounded">
          <div className="px-4 py-2 font-semibold border-b bg-gray-50">Existing Users</div>
          <div className="divide-y">
            {loading && <div className="px-4 py-3">Loading…</div>}
            {!loading && rows.map(p => (
              <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{p.email ?? "—"}</div>
                  <div className="text-xs text-gray-500">id: {p.id.slice(0,8)}… · role: <b>{p.role ?? "none"}</b></div>
                </div>
                <div className="flex gap-2">
                  <button className="border rounded px-3 py-1" onClick={()=>setRole(p.id, "user")}>Make user</button>
                  <button className="border rounded px-3 py-1" onClick={()=>setRole(p.id, "admin")}>Make admin</button>
                  <button className="border rounded px-3 py-1" onClick={()=>sendReset(p.email)}>Send reset link</button>
                </div>
              </div>
            ))}
            {!loading && rows.length===0 && <div className="px-4 py-3">No users</div>}
          </div>
        </div>
      </div>
    </Layout>
  );
}
