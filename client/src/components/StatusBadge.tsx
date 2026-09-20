import type { MigrationStatus, MigrationItemStatus } from '../types';

const STATUS_CONFIG: Record<
  MigrationStatus | MigrationItemStatus,
  { label: string; dot: string; text: string; bg: string }
> = {
  PENDING:     { label: 'Pending',     dot: 'bg-zinc-400',   text: 'text-zinc-400',  bg: 'bg-zinc-400/10'  },
  IN_PROGRESS: { label: 'In Progress', dot: 'bg-blue-400',   text: 'text-blue-400',  bg: 'bg-blue-400/10'  },
  COMPLETED:   { label: 'Completed',   dot: 'bg-emerald-400',text: 'text-emerald-400',bg: 'bg-emerald-400/10'},
  FAILED:      { label: 'Failed',      dot: 'bg-red-400',    text: 'text-red-400',   bg: 'bg-red-400/10'   },
  CANCELLED:   { label: 'Cancelled',   dot: 'bg-amber-400',  text: 'text-amber-400', bg: 'bg-amber-400/10' },
  SKIPPED:     { label: 'Skipped',     dot: 'bg-zinc-500',   text: 'text-zinc-500',  bg: 'bg-zinc-500/10'  },
};

interface Props {
  status: MigrationStatus | MigrationItemStatus;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: Props) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  const px = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${px} ${cfg.text} ${cfg.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
