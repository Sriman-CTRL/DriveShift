import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Folder, File, ChevronRight, Loader2, CheckCircle2 } from 'lucide-react';
import { authApi } from '../api/auth';
import { driveApi } from '../api/drive';
import { migrationsApi } from '../api/migrations';
import type { ConnectedAccount, DriveFile } from '../types';
import { MimeIcon, mimeInfo } from '../components/MimeIcon';

// ── step indicator ──────────────────────────────────────────────────────────

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  const base = 'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all';
  if (done)   return <div className={`${base} bg-indigo-600 text-white`}><CheckCircle2 size={14} /></div>;
  if (active) return <div className={`${base} bg-indigo-600 text-white ring-4 ring-indigo-500/20`}>{n}</div>;
  return <div className={`${base} bg-zinc-800 text-zinc-500`}>{n}</div>;
}

const STEPS = ['Source Account', 'Source File', 'Destination Account', 'Review'];

function StepHeader({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 mb-10">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-1">
            <StepDot n={i + 1} active={i === step} done={i < step} />
            <span className={`text-xs ${i === step ? 'text-zinc-200' : 'text-zinc-600'}`}>{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`h-px w-10 mb-4 ${i < step ? 'bg-indigo-600' : 'bg-zinc-800'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── account selector ────────────────────────────────────────────────────────

function AccountCard({
  account, selected, onClick,
}: {
  account: ConnectedAccount; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`card p-4 text-left w-full transition-all duration-150 flex items-center gap-4 ${
        selected ? 'border-indigo-500 bg-indigo-500/5' : 'card-hover'
      }`}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
        selected ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400'
      }`}>
        {account.user.name?.[0]?.toUpperCase() ?? 'G'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-200 truncate">{account.user.name}</p>
        <p className="text-xs text-zinc-500 truncate">{account.user.email}</p>
      </div>
      {selected && <div className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />}
    </button>
  );
}

// ── file picker ─────────────────────────────────────────────────────────────

function FileRow({
  file, selected, onClick,
}: {
  file: DriveFile; selected: boolean; onClick: () => void;
}) {
  const { isFolder } = mimeInfo(file.mimeType);
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 ${
        selected
          ? 'bg-indigo-500/10 text-indigo-300'
          : 'hover:bg-zinc-800/50 text-zinc-300'
      }`}
    >
      <MimeIcon
        mimeType={file.mimeType}
        size={15}
        className={selected ? 'text-indigo-400' : isFolder ? 'text-amber-400' : 'text-zinc-500'}
      />
      <span className="text-sm truncate flex-1">{file.name}</span>
      {selected && <CheckCircle2 size={14} className="text-indigo-400 flex-shrink-0" />}
    </button>
  );
}

// ── page ────────────────────────────────────────────────────────────────────

export function NewMigrationPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [acctLoading, setAcctLoading] = useState(true);
  const [acctError, setAcctError]     = useState('');

  const [srcAccount, setSrcAccount] = useState<ConnectedAccount | null>(null);
  const [srcFiles, setSrcFiles]     = useState<DriveFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError]     = useState('');
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);

  const [dstAccount, setDstAccount] = useState<ConnectedAccount | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // load accounts
  useEffect(() => {
    authApi.accounts()
      .then(d => setAccounts(d.accounts))
      .catch(e => setAcctError(e.message ?? 'Failed to load accounts'))
      .finally(() => setAcctLoading(false));
  }, []);

  // load files when source account chosen
  async function selectSrcAccount(acc: ConnectedAccount) {
    setSrcAccount(acc);
    setSelectedFile(null);
    setSrcFiles([]);
    setFilesLoading(true);
    setFilesError('');
    try {
      const { files } = await driveApi.listFiles(acc.id);
      setSrcFiles(files);
    } catch (e: unknown) {
      setFilesError((e as Error).message ?? 'Failed to load files');
    } finally {
      setFilesLoading(false);
    }
  }

  // submit
  async function submit() {
    if (!srcAccount || !dstAccount || !selectedFile) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await migrationsApi.create({
        sourceAccountId: srcAccount.id,
        destAccountId:   dstAccount.id,
        ...(selectedFile.mimeType === 'application/vnd.google-apps.folder'
          ? { sourceFolderId: selectedFile.id }
          : { sourceFileId:   selectedFile.id }),
      });
      navigate(`/migrations/${res.job.id}`);
    } catch (e: unknown) {
      setSubmitError((e as Error).message ?? 'Failed to start migration');
    } finally {
      setSubmitting(false);
    }
  }

  const availableDestAccounts = accounts.filter(a => a.id !== srcAccount?.id);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-zinc-100">New Migration</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Move files or folders between your Drive accounts</p>
      </div>

      <StepHeader step={step} />

      {/* ── Step 0: Source Account ── */}
      {step === 0 && (
        <div className="space-y-3">
          {acctLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-zinc-500" />
            </div>
          )}
          {acctError && (
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {acctError}
            </div>
          )}
          {!acctLoading && accounts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-zinc-500 mb-4">No connected accounts found.</p>
              <button onClick={() => navigate('/accounts')} className="btn-secondary">
                Connect an account
              </button>
            </div>
          )}
          {accounts.map(acc => (
            <AccountCard
              key={acc.id}
              account={acc}
              selected={srcAccount?.id === acc.id}
              onClick={() => selectSrcAccount(acc)}
            />
          ))}
          <div className="flex justify-end pt-4">
            <button
              disabled={!srcAccount}
              onClick={() => setStep(1)}
              className="btn-primary"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 1: Select File ── */}
      {step === 1 && (
        <div>
          <p className="text-xs text-zinc-500 mb-3 uppercase tracking-wider">
            From: <span className="text-zinc-300">{srcAccount?.user.email}</span>
          </p>
          <div className="card overflow-hidden mb-4">
            {filesLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-zinc-500" />
              </div>
            )}
            {filesError && (
              <div className="px-4 py-3 text-xs text-red-400">{filesError}</div>
            )}
            {!filesLoading && srcFiles.length === 0 && !filesError && (
              <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
                No files found
              </div>
            )}
            <div className="divide-y divide-zinc-800/60 max-h-80 overflow-y-auto">
              {srcFiles.map(f => (
                <FileRow
                  key={f.id}
                  file={f}
                  selected={selectedFile?.id === f.id}
                  onClick={() => setSelectedFile(f)}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(0)} className="btn-secondary">Back</button>
            <button
              disabled={!selectedFile}
              onClick={() => setStep(2)}
              className="btn-primary"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Destination Account ── */}
      {step === 2 && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500 mb-3 uppercase tracking-wider">
            Migrating: <span className="text-zinc-300">{selectedFile?.name}</span>
          </p>
          {availableDestAccounts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-zinc-500 mb-4">
                You need at least two connected accounts to migrate between them.
              </p>
              <button onClick={() => navigate('/accounts')} className="btn-secondary">
                Connect another account
              </button>
            </div>
          )}
          {availableDestAccounts.map(acc => (
            <AccountCard
              key={acc.id}
              account={acc}
              selected={dstAccount?.id === acc.id}
              onClick={() => setDstAccount(acc)}
            />
          ))}
          <div className="flex justify-between pt-4">
            <button onClick={() => setStep(1)} className="btn-secondary">Back</button>
            <button
              disabled={!dstAccount}
              onClick={() => setStep(3)}
              className="btn-primary"
            >
              Review <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Review ── */}
      {step === 3 && (
        <div>
          <div className="card p-5 mb-6 space-y-4">
            {/* flow */}
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-500 mb-1">From</p>
                <p className="text-sm font-medium text-zinc-200 truncate">{srcAccount?.user.email}</p>
              </div>
              <ArrowRight size={16} className="text-indigo-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-500 mb-1">To</p>
                <p className="text-sm font-medium text-zinc-200 truncate">{dstAccount?.user.email}</p>
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-4">
              <p className="text-xs text-zinc-500 mb-1">File / Folder</p>
              <div className="flex items-center gap-2">
                <MimeIcon mimeType={selectedFile?.mimeType} className="text-zinc-400" />
                <p className="text-sm text-zinc-200 truncate">{selectedFile?.name}</p>
              </div>
            </div>
          </div>

          {submitError && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {submitError}
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="btn-secondary">Back</button>
            <button
              onClick={submit}
              disabled={submitting}
              className="btn-primary"
            >
              {submitting
                ? <><Loader2 size={15} className="animate-spin" /> Starting…</>
                : <><File size={15} /> Start Migration</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
