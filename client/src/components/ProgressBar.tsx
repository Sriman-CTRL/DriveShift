interface Props {
  value: number; // 0–100
  className?: string;
  showLabel?: boolean;
  color?: 'indigo' | 'emerald' | 'red' | 'amber';
}

const COLOR_MAP = {
  indigo:  'bg-indigo-500',
  emerald: 'bg-emerald-500',
  red:     'bg-red-500',
  amber:   'bg-amber-500',
};

export function ProgressBar({ value, className = '', showLabel = false, color = 'indigo' }: Props) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${COLOR_MAP[color]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-zinc-400 tabular-nums w-8 text-right">{pct}%</span>
      )}
    </div>
  );
}
