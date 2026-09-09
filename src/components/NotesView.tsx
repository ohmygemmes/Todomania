import { useEffect, useRef, useState } from "react";
import type { Note } from "../types/task";

interface Props {
  notes: Note[];
  onAdd: (text: string) => void;
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}

/** Teintes de papier, choisies de façon stable à partir de l'identifiant. */
const PAPERS = [
  "bg-amber-50 dark:bg-amber-500/10 border-amber-200/70 dark:border-amber-400/20",
  "bg-sky-50 dark:bg-sky-500/10 border-sky-200/70 dark:border-sky-400/20",
  "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/70 dark:border-emerald-400/20",
  "bg-rose-50 dark:bg-rose-500/10 border-rose-200/70 dark:border-rose-400/20",
  "bg-violet-50 dark:bg-violet-500/10 border-violet-200/70 dark:border-violet-400/20",
];

function paperFor(id: string): string {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum = (sum + id.charCodeAt(i)) % 997;
  return PAPERS[sum % PAPERS.length];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function NotesView({ notes, onAdd, onUpdate, onDelete }: Props) {
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const composeRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (composing) composeRef.current?.focus();
  }, [composing]);

  const commitDraft = () => {
    const v = draft.trim();
    if (v) onAdd(v);
    setDraft("");
    setComposing(false);
  };

  return (
    <div className="notes-view page-view flex flex-col h-full">
      <header className="page-heading px-5 pt-2 pb-3 flex items-end justify-between">
        <div>
          <p className="text-[12px] uppercase tracking-[0.08em] font-semibold text-idayal-text-muted dark:text-zinc-500 mb-0.5">
            Ce que tu gardes
          </p>
          <h1 className="text-[28px] font-bold text-idayal-text dark:text-zinc-100 tracking-tight2 leading-none">
            Notes
          </h1>
          <p className="text-[13px] text-idayal-text-secondary dark:text-zinc-400 mt-1.5">
            <span className="tabular font-semibold text-idayal-text dark:text-zinc-200">
              {notes.length}
            </span>{" "}
            note{notes.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setComposing(true)}
          aria-label="Nouvelle note"
          className="w-10 h-10 rounded-full bg-idayal-blue text-white flex items-center justify-center shadow-[0_4px_12px_rgba(59,125,216,0.35)] active:scale-90 transition"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </header>

      <div className="scroll-content flex-1 overflow-y-auto no-scrollbar px-4 pb-48">
        {composing && (
          <div className="mb-3 rounded-card border border-idayal-blue/30 bg-idayal-bg-elev dark:bg-idayal-bg-dark-elev shadow-elev p-3 animate-slide-in-up">
            <textarea
              ref={composeRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDraft("");
                  setComposing(false);
                }
              }}
              placeholder="Écris ta note…"
              rows={4}
              className="w-full resize-none bg-transparent outline-none text-[14.5px] leading-relaxed text-idayal-text dark:text-zinc-100 placeholder:text-idayal-text-muted"
            />
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  setComposing(false);
                }}
                className="flex-1 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-idayal-text-secondary dark:text-zinc-300 text-[14px] font-semibold active:scale-95 transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={commitDraft}
                disabled={!draft.trim()}
                className="flex-1 h-10 rounded-xl bg-idayal-blue text-white text-[14px] font-semibold disabled:opacity-40 active:scale-95 transition"
              >
                Garder
              </button>
            </div>
          </div>
        )}

        {notes.length === 0 && !composing && (
          <div className="flex flex-col items-center text-center mt-20 px-6">
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center text-3xl mb-4">
              ≡
            </div>
            <p className="text-[17px] font-semibold text-idayal-text dark:text-zinc-100">
              Rien de noté
            </p>
            <p className="text-[13px] text-idayal-text-secondary dark:text-zinc-400 mt-1 max-w-[280px]">
              Les notes que tu écris sur une carte atterrissent ici quand tu
              choisis de les garder.
            </p>
          </div>
        )}

        {/* Deux colonnes dès qu'il y a la place ; hauteurs libres façon papiers épinglés. */}
        <div className="columns-1 sm:columns-2 gap-3">
          {notes.map((n) => (
            <div
              key={n.id}
              className={`break-inside-avoid mb-3 rounded-card border shadow-soft p-3.5 ${paperFor(
                n.id,
              )}`}
            >
              {n.fromTaskTitle && (
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-idayal-text-secondary dark:text-zinc-400 mb-1.5">
                  <svg
                    viewBox="0 0 24 24"
                    width="11"
                    height="11"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12.5l4.5 4.5L20 7" />
                  </svg>
                  <span className="truncate">{n.fromTaskTitle}</span>
                </p>
              )}

              {editingId === n.id ? (
                <textarea
                  autoFocus
                  value={n.text}
                  onChange={(e) => onUpdate(n.id, e.target.value)}
                  onBlur={() => setEditingId(null)}
                  rows={Math.min(
                    12,
                    Math.max(3, n.text.split("\n").length + 1),
                  )}
                  className="w-full resize-none bg-transparent outline-none text-[14.5px] leading-relaxed text-idayal-text dark:text-zinc-100"
                />
              ) : (
                <p
                  onClick={() => setEditingId(n.id)}
                  className="text-[14.5px] leading-relaxed text-idayal-text dark:text-zinc-100 whitespace-pre-wrap break-words cursor-text"
                >
                  {n.text}
                </p>
              )}

              <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-black/5 dark:border-white/10">
                <span className="text-[11px] text-idayal-text-muted tabular">
                  {formatDate(n.createdAt)}
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(n.id)}
                  aria-label="Supprimer la note"
                  className="w-7 h-7 rounded-full flex items-center justify-center text-idayal-text-muted hover:text-red-500 hover:bg-red-500/10 active:scale-90 transition"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
