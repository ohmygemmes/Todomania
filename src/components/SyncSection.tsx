import { useState } from 'react';
import { cloudEnabled, signIn, signOut, signUp } from '../services/cloudSync';
import type { CloudSync } from '../hooks/useCloudSync';

interface Props {
  sync: CloudSync;
}

function formatSyncTime(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? `à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
    : `le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
}

/**
 * Connexion facultative. Sans compte, iDayal reste strictement local : c'est
 * la promesse produit. Le compte ne sert qu'à retrouver ses tâches sur un
 * autre appareil.
 */
export function SyncSection({ sync }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (!cloudEnabled) {
    return (
      <section className="mb-5">
        <p className="text-xs uppercase tracking-[0.08em] text-idayal-text-muted dark:text-zinc-500 px-1 mb-2 font-semibold">
          Synchronisation
        </p>
        <div className="bg-idayal-bg-elev dark:bg-idayal-bg-dark-elev border border-idayal-border dark:border-idayal-border-dark rounded-row px-4 py-3">
          <p className="text-[13px] text-idayal-text-secondary dark:text-zinc-400 leading-relaxed">
            Non configurée sur cette installation. Tes tâches restent sur cet
            appareil.
          </p>
        </div>
      </section>
    );
  }

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'signup') {
        await signUp(email.trim(), password);
        setMessage('Compte créé. Vérifie tes mails si une confirmation est demandée.');
      } else {
        await signIn(email.trim(), password);
        setMessage(null);
        setOpen(false);
      }
      setPassword('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-5">
      <p className="text-xs uppercase tracking-[0.08em] text-idayal-text-muted dark:text-zinc-500 px-1 mb-2 font-semibold">
        Synchronisation
      </p>

      {sync.email ? (
        <div className="bg-idayal-bg-elev dark:bg-idayal-bg-dark-elev border border-idayal-border dark:border-idayal-border-dark rounded-row px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-idayal-text dark:text-zinc-100 font-medium truncate">
                {sync.email}
              </p>
              <p className="text-xs text-idayal-text-secondary dark:text-zinc-400 mt-0.5">
                {sync.status === 'syncing' && 'Synchronisation…'}
                {sync.status === 'error' && (
                  <span className="text-idayal-orange">{sync.lastError}</span>
                )}
                {sync.status === 'idle' &&
                  (sync.lastSyncedAt
                    ? `À jour ${formatSyncTime(sync.lastSyncedAt)}`
                    : 'En attente')}
              </p>
            </div>
            <span
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                sync.status === 'error'
                  ? 'bg-idayal-orange'
                  : sync.status === 'syncing'
                    ? 'bg-idayal-blue animate-shimmer'
                    : 'bg-idayal-blue'
              }`}
            />
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={sync.syncNow}
              className="flex-1 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-idayal-text dark:text-zinc-200 text-[13.5px] font-semibold active:scale-95 transition"
            >
              Synchroniser
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex-1 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-idayal-text-secondary dark:text-zinc-400 text-[13.5px] font-semibold active:scale-95 transition"
            >
              Se déconnecter
            </button>
          </div>
        </div>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full text-left bg-idayal-bg-elev dark:bg-idayal-bg-dark-elev border border-idayal-border dark:border-idayal-border-dark rounded-row px-4 py-3 active:scale-[0.99] transition"
        >
          <p className="text-idayal-text dark:text-zinc-100 font-medium">
            Retrouver mes tâches sur mes autres appareils
          </p>
          <p className="text-xs text-idayal-text-secondary dark:text-zinc-400 mt-0.5">
            Facultatif — sans compte, tout reste sur cet appareil.
          </p>
        </button>
      ) : (
        <div className="bg-idayal-bg-elev dark:bg-idayal-bg-dark-elev border border-idayal-border dark:border-idayal-border-dark rounded-row px-4 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Adresse e-mail"
              autoComplete="email"
              className="w-full h-11 bg-transparent outline-none text-[16px] text-idayal-text dark:text-zinc-100 placeholder:text-idayal-text-muted border-b border-idayal-border dark:border-idayal-border-dark"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className="w-full h-11 bg-transparent outline-none text-[16px] text-idayal-text dark:text-zinc-100 placeholder:text-idayal-text-muted border-b border-idayal-border dark:border-idayal-border-dark"
            />

            {message && (
              <p className="text-[12.5px] text-idayal-orange mt-2 leading-snug">{message}</p>
            )}

            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setMessage(null);
                }}
                className="flex-1 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-idayal-text-secondary dark:text-zinc-400 text-[13.5px] font-semibold active:scale-95 transition"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy || !email.trim() || !password}
                className="flex-1 h-10 rounded-xl bg-idayal-blue text-white text-[13.5px] font-semibold disabled:opacity-40 active:scale-95 transition"
              >
                {busy ? '…' : mode === 'signup' ? 'Créer' : 'Se connecter'}
              </button>
            </div>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setMessage(null);
            }}
            className="w-full text-center text-[12.5px] text-idayal-text-secondary dark:text-zinc-400 mt-2.5 underline"
          >
            {mode === 'signin' ? 'Créer un compte' : "J'ai déjà un compte"}
          </button>
        </div>
      )}
    </section>
  );
}
