import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, ArrowRight, RefreshCw, Filter,
} from 'lucide-react';
import { migrationsApi } from '../api/migrations';
import type { MigrationJob, MigrationStatus } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { ProgressBar } from '../components/ProgressBar';
import { ErrorState } from '../components/ErrorState';

const STATUS_FILTERS: { label: string; value: MigrationStatus | 'ALL' }[] = [
  { label: 'All',         value: 'ALL'        },
  { label: 'Active',      value: 'IN_PROGRESS' },
  { label: 'Pending',     value: 'PENDING'    },
  { label: 'Completed',   value: 'COMPLETED'  },
  { label: 'Failed',      value: 'FAILED'     },
  { label: 'Cancelled',   value: 'CANCELLED'  },
];

function progressColor(status: MigrationJob['status']) {
  if (status === 'COMPLETED') return 'emerald';
  if (status === 'FAILED')    return 'red';
  if (status === 'CANCELLED') return 'amber';
  return 'indigo';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function HistoryPage() {
  const navigate = useNavigate();
  const [jobs, setJobs]         = useState<MigrationJob[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [filter, setFilter]     = useState<MigrationStatus | 'ALL'>('ALL');
  const [search, setSearch]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await migrationsApi.list();
      setJobs(data);
      setError('');
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to load migration history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = jobs.filter(j => {
    if (filter !== 'ALL' && j.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        j.id.includes(q) ||
        (j.sourceFileName ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Migration History</h1>
          <p className="text-sm text-zinc-500 mt-0.5">All past and active migration jobs</p>
        </div>
        <button onClick={load} className="btn-secondary">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or ID…"
            className="input pl-9"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 p-1 card rounded-lg">
          <Filter size={13} className="text-zinc-500 ml-2 flex-shrink-0" />
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors duration-150 ${
                filter === f.value
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && <ErrorState message={error} onRetry={load} />}

      {/* Table skeleton */}
      {loading && !error && (
        <div className="card overflow-hidden divide-y divide-zinc-800/60">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-4 flex items-center gap-4">
              <div className="skeleton h-4 w-48 rounded" />
              <div className="skeleton h-4 w-24 rounded" />
              <div className="flex-1 skeleton h-1.5 rounded-full" />
              <div className="skeleton h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <>
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-sm text-zinc-500">
              {jobs.length === 0
                ? 'No migration jobs yet.'
                : 'No results matching your filter.'}
            </div>
          ) : (
            <div className="card overflow-hidden divide-y divide-zinc-800/60">
              {filtered.map(job => {
                const src = job.sourceAccount?.providerUserId ?? job.sourceAccountId.slice(0, 8);
                const dst = job.destAccount?.providerUserId   ?? job.destAccountId.slice(0, 8);
                return (
                  <button
                    key={job.id}
                    onClick={() => navigate(`/migrations/${job.id}`)}
                    className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-zinc-800/40 transition-colors duration-150 group"
                  >
                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-200 truncate">
                        {job.sourceFileName ?? `Migration ${job.id.slice(0, 8)}`}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500 mt-0.5">
                        <span className="truncate max-w-[90px]">{src}</span>
                        <ArrowRight size={10} className="flex-shrink-0 text-indigo-400" />
                        <span className="truncate max-w-[90px]">{dst}</span>
                      </div>
                    </div>

                    {/* Progress */}
                    <div className="w-28 hidden sm:block">
                      <ProgressBar
                        value={job.progress}
                        color={progressColor(job.status)}
                        showLabel
                      />
                    </div>

                    {/* Files */}
                    <span className="text-xs text-zinc-500 w-20 text-right hidden md:block">
                      {job.completedFiles}/{job.totalFiles} files
                    </span>

                    {/* Date */}
                    <span className="text-xs text-zinc-600 w-28 text-right hidden lg:block">
                      {formatDate(job.createdAt)}
                    </span>

                    {/* Status */}
                    <StatusBadge status={job.status} size="sm" />
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-xs text-zinc-600 mt-3 text-right">
            {filtered.length} job{filtered.length !== 1 ? 's' : ''}
          </p>
        </>
      )}
    </div>
  );
}
