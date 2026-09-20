import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = 'Something went wrong.', onRetry }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="p-3 rounded-full bg-red-500/10">
        <AlertCircle size={24} className="text-red-400" />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-200">Error</p>
        <p className="text-sm text-zinc-500 mt-1 max-w-sm">{message}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary">
          <RefreshCw size={14} />
          Retry
        </button>
      )}
    </div>
  );
}
