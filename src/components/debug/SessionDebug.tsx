// src/components/devtools/SessionDebug.tsx
import { useSession } from '@supabase/auth-helpers-react';

export default function SessionDebug() {
  const session = useSession();
  const user = session?.user;

  const expires = session?.expires_at
    ? new Date(session.expires_at * 1000).toLocaleString()
    : '—';

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white border border-gray-300 shadow-lg p-4 rounded-lg text-sm w-[280px]">
      <h2 className="font-bold text-gray-800 mb-2">🔐 Session Debug</h2>
      <div className="space-y-1 text-gray-700">
        <div>
          <span className="font-medium">Status:</span>{' '}
          {session ? (
            <span className="text-green-600">✅ Active</span>
          ) : (
            <span className="text-red-600">❌ None</span>
          )}
        </div>
        <div>
          <span className="font-medium">Email:</span>{' '}
          {user?.email || '—'}
        </div>
        <div>
          <span className="font-medium">User ID:</span>{' '}
          {user?.id || '—'}
        </div>
        <div>
          <span className="font-medium">Expires At:</span>{' '}
          {expires}
        </div>
      </div>
    </div>
  );
}
