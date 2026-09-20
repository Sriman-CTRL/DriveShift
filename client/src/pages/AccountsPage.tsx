import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, ExternalLink, RefreshCw } from 'lucide-react';
import { authApi } from '../api/auth';
import type { ConnectedAccount } from '../types';
import { ErrorState } from '../components/ErrorState';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// Google provider icon
function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" className="flex-shrink-0">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

export function AccountsPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const load = () => {
    setLoading(true);
    authApi.accounts()
      .then(d => { setAccounts(d.accounts); setError(''); })
      .catch(e => setError(e.message ?? 'Failed to load accounts'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAddAccount = () => {
    // Initiates a new Google OAuth flow; the backend creates a new ConnectedAccount
    window.location.href = '/auth/google';
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Connected Accounts</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Manage the Google Drive accounts linked to DriveShift
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-secondary">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={handleAddAccount} className="btn-primary">
            <Plus size={16} />
            Add Account
          </button>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {/* Skeleton */}
      {loading && !error && (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="card p-5 flex items-center gap-4">
              <div className="skeleton w-12 h-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-40 rounded" />
                <div className="skeleton h-3 w-56 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && accounts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-5">
            <Users size={28} className="text-zinc-500" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-200 mb-2">No connected accounts</h2>
          <p className="text-sm text-zinc-500 max-w-xs mb-8 leading-relaxed">
            Connect a Google Drive account to start migrating files.
          </p>
          <button onClick={handleAddAccount} className="btn-primary">
            <Plus size={16} />
            Connect Google Account
          </button>
        </div>
      )}

      {/* Account list */}
      {!loading && !error && accounts.length > 0 && (
        <div className="space-y-3">
          {accounts.map((acc, idx) => (
            <div key={acc.id} className="card p-5 flex items-center gap-4">
              {/* Avatar */}
              <div className="w-12 h-12 rounded-full bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center text-lg font-bold text-indigo-400 flex-shrink-0">
                {acc.user.name?.[0]?.toUpperCase() ?? 'G'}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-zinc-200 truncate">{acc.user.name}</p>
                  {idx === 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-xs border border-indigo-500/20">
                      Primary
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 truncate">{acc.user.email}</p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-600">
                    <GoogleIcon />
                    Google Drive
                  </div>
                  <span className="text-zinc-700">·</span>
                  <span className="text-xs text-zinc-600">Connected {formatDate(acc.createdAt)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => navigate(`/migrations/new`)}
                  className="btn-secondary text-xs px-3 py-1.5"
                  title="Start migration from this account"
                >
                  <ExternalLink size={13} />
                  Migrate
                </button>
              </div>
            </div>
          ))}

          {/* Add another */}
          <button
            onClick={handleAddAccount}
            className="w-full card card-hover p-4 flex items-center justify-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 border-dashed"
          >
            <Plus size={16} />
            Connect another Google account
          </button>
        </div>
      )}

      <div className="mt-8 p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/60">
        <p className="text-xs text-zinc-500 leading-relaxed">
          <span className="text-zinc-400 font-medium">Note:</span> Adding an account re-initiates the Google OAuth flow.
          DriveShift will associate the new Drive account with your existing session automatically.
        </p>
      </div>
    </div>
  );
}
