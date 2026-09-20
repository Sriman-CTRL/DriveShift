import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Zap, RefreshCw, Activity, ShieldCheck, FolderSync, Clock
} from 'lucide-react';

const FEATURES = [
  { icon: FolderSync, title: 'Cross-account migration',   desc: 'Move files and folders between separate Google Drive accounts.'         },
  { icon: Activity,   title: 'Streaming transfers',       desc: 'Files are streamed directly — no intermediate storage required.'        },
  { icon: Clock,      title: 'Background processing',     desc: 'Migrations run asynchronously via BullMQ so your browser stays free.'   },
  { icon: RefreshCw,  title: 'Automatic retries',         desc: 'Failed transfers retry with exponential backoff, up to 3 attempts.'     },
  { icon: Zap,        title: 'Progress tracking',         desc: 'Per-file and per-folder progress updated in real time from Postgres.'   },
  { icon: ShieldCheck,title: 'Safe cancellation',         desc: 'Cancel any in-flight migration; completed files are never rolled back.' },
];

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Nav */}
      <header className="border-b border-zinc-800/60 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <span className="font-semibold text-sm text-zinc-100">DriveShift</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/login')} className="btn-secondary">
            Sign in
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center max-w-3xl mx-auto w-full">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-8">
          <Zap size={12} />
          Cloud file migration
        </div>

        <h1 className="text-5xl font-bold tracking-tight text-zinc-100 leading-tight mb-5">
          Move your files between<br />
          <span className="text-indigo-400">cloud accounts</span>{' '}
          without the manual work.
        </h1>

        <p className="text-zinc-400 text-lg leading-relaxed max-w-xl mb-10">
          DriveShift performs asynchronous cross-account Google Drive migrations with
          real-time progress tracking, automatic retries, and cooperative cancellation.
        </p>

        {/* Flow diagram */}
        <div className="flex items-center gap-4 mb-12 px-6 py-4 card">
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <FolderSync size={18} className="text-blue-400" />
            </div>
            <span className="text-xs text-zinc-500">Google Drive A</span>
          </div>
          <div className="flex flex-col items-center gap-1 text-zinc-600">
            <div className="flex items-center gap-1">
              <div className="w-8 h-px bg-zinc-700" />
              <ArrowRight size={14} className="text-indigo-400" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Zap size={18} className="text-indigo-400" />
            </div>
            <span className="text-xs text-zinc-500">DriveShift</span>
          </div>
          <div className="flex flex-col items-center gap-1 text-zinc-600">
            <div className="flex items-center gap-1">
              <div className="w-8 h-px bg-zinc-700" />
              <ArrowRight size={14} className="text-indigo-400" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <FolderSync size={18} className="text-emerald-400" />
            </div>
            <span className="text-xs text-zinc-500">Google Drive B</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/login')}
            className="btn-primary px-6 py-2.5 text-sm"
          >
            Get Started
            <ArrowRight size={16} />
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-secondary px-6 py-2.5 text-sm"
          >
            View Dashboard
          </button>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-zinc-800/60 py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-widest text-center mb-12">
            What DriveShift does
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="card p-5 card-hover">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center mb-3">
                  <Icon size={16} className="text-indigo-400" />
                </div>
                <p className="text-sm font-semibold text-zinc-200 mb-1">{title}</p>
                <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-800/60 py-6 px-6 text-center text-xs text-zinc-600">
        DriveShift — built with Express, BullMQ, Prisma, and React.
      </footer>
    </div>
  );
}
