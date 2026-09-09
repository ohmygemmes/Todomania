import { useDialogFocus } from "../hooks/useDialogFocus";
import type { Task } from "../types/task";

export type CompleteStep = "subtasks" | "note";

interface Props {
  task: Task | null;
  step: CompleteStep | null;
  /** Poursuivre : passe à l'étape suivante, ou termine. */
  onConfirm: (keepNote: boolean) => void;
  onCancel: () => void;
}

/**
 * Deux garde-fous avant de clore une tâche :
 *  - il reste des étapes non cochées → on demande confirmation ;
 *  - la tâche porte une note → on demande si on la conserve.
 */
export function CompleteTaskDialog({ task, step, onConfirm, onCancel }: Props) {
  const dialogRef = useDialogFocus(!!task && !!step, onCancel);
  if (!task || !step) return null;

  const remaining = (task.subtasks ?? []).filter((s) => !s.done).length;
  const note = (task.note ?? "").trim();

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Terminer la tâche"
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />

      <div className="relative w-full max-w-app mx-3 mb-3 sm:mb-0 bg-idayal-bg-elev dark:bg-idayal-bg-dark-elev rounded-card shadow-elev border border-idayal-border dark:border-idayal-border-dark p-5 animate-slide-in-up">
        {step === "subtasks" ? (
          <>
            <div className="w-11 h-11 rounded-full bg-idayal-orange-soft dark:bg-idayal-orange/20 text-idayal-orange flex items-center justify-center mb-3">
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 8v5M12 17h.01" />
                <circle cx="12" cy="12" r="9" />
              </svg>
            </div>
            <h2 className="text-[18px] font-bold text-idayal-text dark:text-zinc-100 tracking-tight2">
              Il reste {remaining} étape{remaining > 1 ? "s" : ""}
            </h2>
            <p className="text-[14px] text-idayal-text-secondary dark:text-zinc-400 mt-1">
              Tu veux quand même marquer «&nbsp;{task.title}&nbsp;» comme faite
              ?
            </p>

            <ul className="mt-3 space-y-1.5 max-h-40 overflow-y-auto no-scrollbar">
              {(task.subtasks ?? [])
                .filter((s) => !s.done)
                .map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 text-[13.5px] text-idayal-text-secondary dark:text-zinc-400"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-idayal-orange flex-shrink-0" />
                    <span className="truncate">{s.title}</span>
                  </li>
                ))}
            </ul>

            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-idayal-text dark:text-zinc-200 font-semibold text-[15px] active:scale-95 transition"
              >
                Pas encore
              </button>
              <button
                type="button"
                onClick={() => onConfirm(true)}
                className="flex-1 h-12 rounded-2xl bg-idayal-blue text-white font-semibold text-[15px] shadow-[0_6px_16px_rgba(61,186,142,0.35)] active:scale-95 transition"
              >
                Terminer
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="w-11 h-11 rounded-full bg-idayal-blue-soft dark:bg-idayal-blue/20 text-idayal-blue flex items-center justify-center mb-3">
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 4h11l4 4v12H5z" />
                <path d="M9 9h6M9 13h6M9 17h4" />
              </svg>
            </div>
            <h2 className="text-[18px] font-bold text-idayal-text dark:text-zinc-100 tracking-tight2">
              Garder ta note ?
            </h2>
            <p className="text-[14px] text-idayal-text-secondary dark:text-zinc-400 mt-1">
              Elle sera rangée dans tes Notes. Sinon elle part avec la tâche.
            </p>

            <div className="mt-3 p-3 rounded-row bg-amber-50 dark:bg-amber-500/10 border border-amber-200/70 dark:border-amber-400/20 max-h-32 overflow-y-auto no-scrollbar">
              <p className="text-[13.5px] text-idayal-text dark:text-zinc-200 whitespace-pre-wrap break-words">
                {note}
              </p>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => onConfirm(false)}
                className="flex-1 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-idayal-text dark:text-zinc-200 font-semibold text-[15px] active:scale-95 transition"
              >
                Ne pas garder
              </button>
              <button
                type="button"
                onClick={() => onConfirm(true)}
                className="flex-1 h-12 rounded-2xl bg-idayal-blue text-white font-semibold text-[15px] shadow-[0_6px_16px_rgba(59,125,216,0.35)] active:scale-95 transition"
              >
                Garder
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
