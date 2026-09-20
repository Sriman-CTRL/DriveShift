import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, RefreshCw, ArrowRight, Zap, CheckCircle2,
  XCircle, Clock, Activity,
} from 'lucide-react';
import { migrationsApi } from '../api/migrations';
import type { MigrationJob } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { ProgressBar } from '../components/ProgressBar';
import { ErrorState } from '../components/ErrorState';

// ── helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function progressColor(status: MigrationJob['status']) {
  if (status === 'COMPLETED') return 'emerald';
  if (status === 'FAILED')    return 'red';
  if (status === 'CANCELLED') return 'amber';
  return 'indigo';
}

// ── stat card ──────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, accent,
}: {
  label: string; value: number;
  icon: React.ElementType; accent: string;
}) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-2xl font-bold text-zinc-100 tabular-nums">{value}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ── job card ───────────────────────────────────────────────────────────────

function JobCard({ job, onClick }: { job: MigrationJob; onClick: () => void }) {
  const src = job.sourceAccount?.providerUserId ?? job.sourceAccountId.slice(0, 8);
  const dst = job.destAccount?.providerUserId   ?? job.destAccountId.slice(0, 8);

  return (
    <button
      onClick={onClick}
      className="card card-hover p-5 text-left w-full group transition-all duration-200 hover:shadow-lg hover:shadow-black/20"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-200 truncate mb-1">
            {job.sourceFileName ?? `Migration ${job.id.slice(0, 8)}`}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="truncate max-w-[100px]">{src}</span>
            <ArrowRight size={10} className="flex-shrink-0 text-indigo-400" />
            <span className="truncate max-w-[100px]">{dst}</span>
          </div>
        </div>
        <StatusBadge status={job.status} size="sm" />
      </div>

      {/* Progress */}
      <ProgressBar
        value={job.progress}
        color={progressColor(job.status)}
        showLabel
        className="mb-3"
      />

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{job.completedFiles}/{job.totalFiles} files</span>
        <span>{formatDate(job.createdAt)}</span>
      </div>
    </button>
  );
}

// ── empty state ────────────────────────────────────────────────────────────

function EmptyMigrations({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5">
        <Zap size={28} className="text-indigo-400" />
      </div>
      <h2 className="text-lg font-semibold text-zinc-200 mb-2">No migrations yet</h2>
      <p className="text-sm text-zinc-500 max-w-xs mb-8 leading-relaxed">
        Start your first migration to move files between Google Drive accounts.
      </p>
      <button onClick={onNew} className="btn-primary">
        <Plus size={16} />
        New Migration
      </button>
    </div>
  );
}

// ── page ───────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const navigate = useNavigate();
  const [jobs, setJobs]     = useState<MigrationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [polling, setPolling] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setPolling(true);
    try {
      const data = await migrationsApi.list();
      setJobs(data);
      setError('');
    } catch (e: unknown) {
      if (!silent) setError((e as Error).message ?? 'Failed to load migrations');
    } finally {
      setLoading(false);
      setPolling(false);
    }
  }, []);

  // initial load
  useEffect(() => { load(); }, [load]);

  // poll every 5 s if any job is active
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'PENDING' || j.status === 'IN_PROGRESS');
    if (!hasActive) return;
    const id = setInterval(() => load(true), 5000);
    return () => clearInterval(id);
  }, [jobs, load]);

  // stats
  const active    = jobs.filter(j => j.status === 'IN_PROGRESS').length;
  const completed = jobs.filter(j => j.status === 'COMPLETED').length;
  const failed    = jobs.filter(j => j.status === 'FAILED').length;
  const pending   = jobs.filter(j => j.status === 'PENDING').length;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Title row */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Overview of your migration jobs</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={polling}
            className="btn-secondary"
            title="Refresh"
          >
            <RefreshCw size={15} className={polling ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button onClick={() => navigate('/migrations/new')} className="btn-primary">
            <Plus size={16} />
            New Migration
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active"    value={active}    icon={Activity}      accent="bg-blue-500/10 border border-blue-500/20 text-blue-400" />
        <StatCard label="Pending"   value={pending}   icon={Clock}         accent="bg-zinc-500/10 border border-zinc-500/20 text-zinc-400" />
        <StatCard label="Completed" value={completed} icon={CheckCircle2}  accent="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" />
        <StatCard label="Failed"    value={failed}    icon={XCircle}       accent="bg-red-500/10 border border-red-500/20 text-red-400" />
      </div>

      {/* Jobs grid */}
      {error && <ErrorState message={error} onRetry={() => load()} />}

      {loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-5 space-y-3">
              <div className="skeleton h-4 w-3/4 rounded" />
              <div className="skeleton h-3 w-1/2 rounded" />
              <div className="skeleton h-1.5 w-full rounded-full mt-2" />
              <div className="flex justify-between">
                <div className="skeleton h-3 w-20 rounded" />
                <div className="skeleton h-3 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && jobs.length === 0 && (
        <EmptyMigrations onNew={() => navigate('/migrations/new')} />
      )}

      {!loading && !error && jobs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {jobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              onClick={() => navigate(`/migrations/${job.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
