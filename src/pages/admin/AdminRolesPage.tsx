// FULL OVERWRITE FROM VERIFIED WORKING VERSION
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Layout from '@/components/layout/Layout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Trash2,
  AlertTriangle,
  CheckCircle,
  Loader2,
  KeyRound,
  ChevronLeft,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

interface Profile {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
  email_confirmed_at?: string | null;
}

const EDGE_BASE_URL = import.meta.env.VITE_SUPABASE_EDGE_URL;

export default function AdminRolesPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<Profile[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordModalUserId, setPasswordModalUserId] = useState<string | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      setAccessToken(session?.access_token || null);
      if (session?.user?.id) setAdminId(session.user.id);
    });
  }, []);

  useEffect(() => {
    if (accessToken) fetchUsers();
  }, [accessToken, showArchived]);

  async function fetchUsers() {
    setIsLoading(true);
    try {
      const [{ data: profiles }, authResRaw] = await Promise.all([
        supabase.from('profiles').select('*'),
        fetch(`${EDGE_BASE_URL}/list-users`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);
      const authJson = await authResRaw.json();
      if (!profiles || authJson.error) throw new Error(authJson.error || 'Fetch error');
      const enriched = (profiles as Profile[]).map((profile) => {
        const match = authJson.find((u: any) => u.id === profile.id);
        return { ...profile, email_confirmed_at: match?.created_at || null };
      });
      setUsers(enriched.filter((u) => (showArchived ? true : u.is_active)));
    } catch (e) {
      toast.error('Failed loading users');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConfirmUser(userId: string) {
    if (!accessToken) return;
    try {
      const res = await fetch(`${EDGE_BASE_URL}/confirm-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ user_id: userId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to confirm user');
      toast.success('Email confirmed');
      fetchUsers();
    } catch (e) {
      toast.error('Failed to confirm email');
      console.error(e);
    }
  }

  async function handlePasswordUpdate() {
    if (!passwordModalUserId || !accessToken || newPasswordValue.length < 8) return;
    setIsUpdatingPassword(true);
    try {
      const res = await fetch(`${EDGE_BASE_URL}/update-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          user_id: passwordModalUserId,
          new_password: newPasswordValue,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Password update failed');
      toast.success('Password updated');
      setPasswordModalUserId(null);
      setNewPasswordValue('');
    } catch (e) {
      toast.error('Password update failed');
      console.error(e);
    } finally {
      setIsUpdatingPassword(false);
    }
  }

  async function handleAddUser() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (!adminId || !accessToken) {
      toast.error('Session expired, please sign in again');
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch(`${EDGE_BASE_URL}/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          role: newRole,
          admin_id: adminId,
        }),
      });
      const text = await res.text();
      console.log('[create-user response]', text);
      const json = JSON.parse(text);
      if (!res.ok) throw new Error(json.error || 'Create failed');

      toast.success(`${newEmail} was added as ${newRole}`);
      setTimeout(() => {
        setIsDialogOpen(false);
        setNewEmail('');
        setNewPassword('');
        setNewRole('user');
        fetchUsers();
      }, 500);
    } catch (e: any) {
      toast.error(e.message || 'Unexpected error');
      console.error(e);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete(userId: string) {
    if (!adminId || !accessToken) {
      toast.error('Session expired');
      return;
    }

    setIsDeleting(userId);

    try {
      const res = await fetch(`${EDGE_BASE_URL}/delete-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ user_id: userId, admin_id: adminId }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');

      toast.success('User deleted');
      fetchUsers();
    } catch (e) {
      toast.error((e as Error).message || 'Unexpected error');
      console.error(e);
    } finally {
      setIsDeleting(null);
    }
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate("/admin/users-invite")}>Invite User</Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Admin Dashboard
          </Button>
          <Button onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Hide Archived' : 'Show Archived'}
          </Button>
        </div>
      </div>

      <Dialog open={!!passwordModalUserId} onOpenChange={() => setPasswordModalUserId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="password"
              placeholder="New password"
              value={newPasswordValue}
              onChange={(e) => setNewPasswordValue(e.target.value)}
            />
            <Button onClick={handlePasswordUpdate} disabled={isUpdatingPassword} className="w-full">
              {isUpdatingPassword ? <Loader2 className="animate-spin" /> : 'Save Password'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="text-center py-10">
          <Loader2 className="mx-auto animate-spin" />
          <p className="mt-2 text-gray-500">Loading users...</p>
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="p-2 text-left">Email</th>
              <th className="p-2 text-left">Role</th>
              <th className="p-2 text-center">Status</th>
              <th className="p-2 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-2">{u.email}</td>
                <td className="p-2">
                  <Select
                    value={u.role}
                    onValueChange={async (val) => {
                      await supabase.from('profiles').update({ role: val }).eq('id', u.id);
                      await fetchUsers();
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-2 text-center">
                  {u.is_active ? (
                    <CheckCircle className="text-green-600 mx-auto" title="Active" />
                  ) : (
                    <AlertTriangle className="text-red-600 mx-auto" title="Archived" />
                  )}
                </td>
                <td className="p-2 text-center flex items-center justify-center gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setPasswordModalUserId(u.id)}
                  >
                    <KeyRound size={16} />
                  </Button>

                  {u.email_confirmed_at ? null : (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => handleConfirmUser(u.id)}
                    >
                      <ShieldCheck size={16} />
                    </Button>
                  )}

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button disabled={isDeleting === u.id}>
                        {isDeleting === u.id ? (
                          <Loader2 className="mx-auto animate-spin" />
                        ) : (
                          <Trash2 className="text-red-500" />
                        )}
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent aria-describedby="delete-user-desc">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {u.email}?</AlertDialogTitle>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(u.id)}>
                          Confirm
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  );
}