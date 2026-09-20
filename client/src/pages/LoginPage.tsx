import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Zap, ShieldCheck } from 'lucide-react';
import { useAuth, setToken } from '../context/AuthContext';

/**
 * The Google OAuth callback returns a JWT via query param after the backend
 * redirects to the frontend. In production, the backend /auth/google/callback
 * handler currently returns JSON directly. For the OAuth popup/redirect flow,
 * we encode the token in the redirect URL: ?token=<jwt>
 *
 * If the user arrives here WITH a token query param, we store it and redirect.
 * Otherwise, clicking "Continue with Google" redirects to the backend OAuth endpoint.
 */
export function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, refresh } = useAuth();
  const [error, setError] = useState('');

  // Handle token returned from OAuth callback
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      setToken(token);
      refresh().then(() => navigate('/dashboard'));
    }
  }, [searchParams, refresh, navigate]);

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard');
  }, [isAuthenticated, navigate]);

  const handleGoogleLogin = () => {
    // Redirect to the backend's Google OAuth initiation endpoint.
    // The backend will handle the OAuth flow and ultimately redirect back to
    // /auth/google/callback. We need the callback to redirect the user to the
    // frontend with the token as a query param.
    window.location.href = '/auth/google';
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
            <Zap size={18} className="text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-zinc-100">DriveShift</span>
        </div>

        {/* Card */}
        <div className="card p-8">
          <h1 className="text-lg font-semibold text-zinc-100 text-center mb-1">
            Connect your Google Drive
          </h1>
          <p className="text-sm text-zinc-500 text-center mb-8">
            Sign in with Google to start migrating files between your Drive accounts.
          </p>

          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {error}
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg 
                       bg-white hover:bg-zinc-100 text-zinc-900 font-medium text-sm 
                       transition-colors duration-150"
          >
            {/* Google logo SVG */}
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
            </svg>
            Continue with Google
          </button>

          <div className="mt-6 pt-6 border-t border-zinc-800">
            <div className="flex items-start gap-2.5">
              <ShieldCheck size={14} className="text-indigo-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-zinc-500 leading-relaxed">
                DriveShift requests Google Drive access to list and transfer files on your behalf.
                Your credentials are stored securely and never shared.
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-zinc-600 mt-6">
          Need to add another account?{' '}
          <span className="text-indigo-400">Sign in again after logging in.</span>
        </p>
      </div>
    </div>
  );
}
