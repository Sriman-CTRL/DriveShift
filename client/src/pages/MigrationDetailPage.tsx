import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, StopCircle, CheckCircle2, XCircle,
  Clock, Activity, File, AlertTriangle,
} from 'lucide-react';
import { migrationsApi } from '../api/migrations';
import type { MigrationJob, MigrationItem } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { ProgressBar } from '../components/ProgressBar';
import { MimeIcon } from '../components/MimeIcon';
import { ErrorState } from '../components/ErrorState';
import { Modal } from '../components/Modal';

// ── helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function elapsed(start: string, end?: string | null) {
  const ms = new Date(end ?? new Date()).getTime() - new Date(start).getTime();
  const s  = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function progressColor(status: MigrationJob['status']) {
  if (status === 'COMPLETED') return 'emerald';
  if (status === 'FAILED')    return 'red';
  if (status === 'CANCELLED') return 'amber';
  return 'indigo';
}

// ── stat pill ────────────────────────────────────────────────────────────────

function Pill({
  icon: Icon, label, value, accent,
}: {
  icon: React.ElementType; label: string; value: string | number; accent: string;
}) {
  return (
    <div className="flex items-center gap-3 card px-4 py-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>
        <Icon size={15} />
      </div>
      <div>
        <p className="text-lg font-bold text-zinc-100 tabular-nums leading-none">{value}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ── item row ─────────────────────────────────────────────────────────────────

function ItemRow({ item }: { item: MigrationItem }) {
  const statusIcon = {
    COMPLETED:   <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />,
    FAILED:      <XCircle      size={14} className="text-red-400 flex-shrink-0"     />,
    IN_PROGRESS: <Activity     size={14} className="text-blue-400 flex-shrink-0 animate-pulse" />,
    PENDING:     <Clock        size={14} className="text-zinc-500 flex-shrink-0"    />,
    SKIPPED:     <AlertTriangle size={14} className="text-amber-400 flex-shrink-0"  />,
  }[item.status];

  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-800/30 transition-colors duration-100">
      <MimeIcon
        mimeType={item.sourceMimeType}
        size={14}
        className="text-zinc-500 flex-shrink-0"
      />
      <span className="text-sm text-zinc-300 flex-1 truncate">
        {item.sourceFileName ?? item.sourceFileId}
      </span>
      {item.errorMessage && (
        <span className="text-xs text-red-400 truncate max-w-[180px]" title={item.errorMessage}>
          {item.errorMessage}
        </span>
      )}
      {statusIcon}
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export function MigrationDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate  = useNavigate();

  const [job, setJob]           = useState<MigrationJob | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!jobId) return;
    if (!silent) setLoading(true);
    try {
      const data = await migrationsApi.get(jobId);
      setJob(data);
      setError('');
    } catch (e: unknown) {
      if (!silent) setError((e as Error).message ?? 'Failed to load migration');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  // Poll while active
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!job) return;
    const isActive = job.status === 'PENDING' || job.status === 'IN_PROGRESS';
    if (isActive && !pollRef.current) {
      pollRef.current = setInterval(() => load(true), 3000);
    }
    if (!isActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [job?.status, load]);

  const handleCancel = async () => {
    if (!jobId) return;
    setCancelling(true);
    try {
      const res = await migrationsApi.cancel(jobId);
      setJob(res.job);
      setShowCancel(false);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Cancel failed');
    } finally {
      setCancelling(false);
    }
  };

  const isActive = job?.status === 'PENDING' || job?.status === 'IN_PROGRESS';

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Back + title */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate(-1)}
          className="btn-secondary p-2"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-zinc-100 truncate">
            {job?.sourceFileName ?? 'Migration Details'}
          </h1>
          {job && (
            <p className="text-xs text-zinc-500 font-mono mt-0.5">{job.id}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load(true)} className="btn-secondary">
            <RefreshCw size={14} />
          </button>
          {isActive && (
            <button
              onClick={() => setShowCancel(true)}
              className="btn-danger"
            >
              <StopCircle size={15} />
              Cancel
            </button>
          )}
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={() => load()} />}

      {/* Skeleton */}
      {loading && !error && (
        <div className="space-y-4">
          <div className="card p-6 space-y-3">
            <div className="skeleton h-5 w-48 rounded" />
            <div className="skeleton h-2 w-full rounded-full" />
            <div className="grid grid-cols-3 gap-4 pt-2">
              {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-14 rounded-lg" />)}
            </div>
          </div>
          <div className="card overflow-hidden">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-3 px-5 py-3">
                <div className="skeleton h-4 w-4 rounded" />
                <div className="skeleton h-4 flex-1 rounded" />
              </div>
            ))}
          </div>
        </div>
      )}

      {job && !loading && (
        <div className="space-y-6">
          {/* Overview card */}
          <div className="card p-6">
            {/* Status + badge */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-zinc-400">Status</p>
              <StatusBadge status={job.status} />
            </div>

            {/* Progress bar */}
            <div className="mb-5">
              <div className="flex justify-between text-xs text-zinc-500 mb-2">
                <span>Progress</span>
                <span className="tabular-nums">{job.progress}%</span>
              </div>
              <ProgressBar
                value={job.progress}
                color={progressColor(job.status)}
                className="h-2"
              />
            </div>

            {/* Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Pill
                icon={File}
                label="Files"
                value={`${job.completedFiles}/${job.totalFiles}`}
                accent="bg-indigo-500/10 text-indigo-400"
              />
              <Pill
                icon={CheckCircle2}
                label="Folders"
                value={`${job.completedFolders}/${job.totalFolders}`}
                accent="bg-emerald-500/10 text-emerald-400"
              />
              <Pill
                icon={Clock}
                label="Started"
                value={formatDate(job.createdAt)}
                accent="bg-zinc-700/40 text-zinc-400"
              />
              <Pill
                icon={Activity}
                label="Elapsed"
                value={elapsed(job.createdAt, job.status === 'IN_PROGRESS' ? null : job.updatedAt)}
                accent="bg-zinc-700/40 text-zinc-400"
              />
            </div>

            {/* Error message */}
            {job.errorMessage && (
              <div className="mt-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex gap-2">
                <XCircle size={14} className="flex-shrink-0 mt-0.5" />
                {job.errorMessage}
              </div>
            )}

            {/* Accounts */}
            <div className="mt-5 pt-4 border-t border-zinc-800 grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-zinc-500 mb-1">Source</p>
                <p className="text-zinc-300 font-mono truncate">
                  {job.sourceAccount?.providerUserId ?? job.sourceAccountId}
                </p>
              </div>
              <div>
                <p className="text-zinc-500 mb-1">Destination</p>
                <p className="text-zinc-300 font-mono truncate">
                  {job.destAccount?.providerUserId ?? job.destAccountId}
                </p>
              </div>
            </div>
          </div>

          {/* Items list */}
          {job.items && job.items.length > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                Items ({job.items.length})
              </p>
              <div className="card overflow-hidden divide-y divide-zinc-800/60">
                {job.items.map(item => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cancel confirm modal */}
      <Modal
        open={showCancel}
        onClose={() => setShowCancel(false)}
        title="Cancel migration?"
      >
        <p className="text-sm text-zinc-400 leading-relaxed mb-6">
          The migration will stop after its current file completes. Files that have
          already been copied will remain in the destination.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setShowCancel(false)} className="btn-secondary">
            Keep going
          </button>
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="btn-danger"
          >
            <StopCircle size={15} />
            {cancelling ? 'Cancelling…' : 'Yes, cancel'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
