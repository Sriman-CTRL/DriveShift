import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Plus, History, Users, LogOut, Zap, ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/dashboard',  label: 'Dashboard',         icon: LayoutDashboard },
  { to: '/migrations/new', label: 'New Migration',  icon: Plus            },
  { to: '/history',    label: 'Migration History',  icon: History         },
  { to: '/accounts',   label: 'Connected Accounts', icon: Users           },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 flex flex-col border-r border-zinc-800 bg-zinc-900/50">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-zinc-800">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <span className="font-semibold text-sm tracking-tight text-zinc-100">DriveShift</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
              }
            >
              <Icon size={16} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-zinc-800">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center text-xs font-semibold text-indigo-400">
              {user?.name?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-200 truncate">{user?.name}</p>
              <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="sidebar-link w-full mt-1 text-red-400 hover:text-red-300 hover:bg-red-400/5"
          >
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

/** Protected route wrapper */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  return <>{children}</>;
}
