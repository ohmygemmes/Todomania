import { useMemo, useRef, useState } from "react";
import { useSwipeGesture } from "../hooks/useSwipeGesture";
import type { RecurrenceRule, Task } from "../types/task";
import { CardTimer } from "./CardTimer";
import { EditableTaskTitle } from "./EditableTaskTitle";
import { Icon } from "./Icon";
import { RecurrenceControl } from "./RecurrenceControl";
import { WhenSheet } from "./WhenSheet";

interface Props {
  task: Task;
  /** 0 = carte du dessus, 1 / 2 = cartes empilées en dessous. */
  depth: number;
  onDone: () => void;
  onPostpone: () => void;
  /** Pose une échéance choisie dans la feuille « Quand ? ». */
  onReschedule?: (scheduledDate: string) => void;
  /** Cette tâche est-elle celle qui reste en tête du paquet ? */
  isPinned?: boolean;
  onTogglePin?: () => void;
  onSetNote?: (text: string) => void;
  onAddSubtask?: (title: string) => void;
  onToggleSubtask?: (subId: string) => void;
  onDeleteSubtask?: (subId: string) => void;
  onEditTitle?: (title: string) => void;
  onRecurrenceChange?: (rule: RecurrenceRule | null) => void;
  /** Consultation d'une carte future, sans modifier son échéance. */
  isFuture?: boolean;
}

export function SwipeCard({
  task,
  depth,
  onDone,
  onPostpone,
  onReschedule,
  isPinned = false,
  onTogglePin,
  onSetNote,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onEditTitle,
  onRecurrenceChange,
  isFuture = false,
}: Props) {
  const isTop = depth === 0;
  const [whenOpen, setWhenOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [subDraft, setSubDraft] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const subInputRef = useRef<HTMLInputElement>(null);

  const { ref, state } = useSwipeGesture<HTMLDivElement>({
    enabled: isTop && !editingTitle,
    onSwipeRight: () => {
      try {
        navigator.vibrate?.(15);
      } catch {
        /* ignore */
      }
      onDone();
    },
    /*
     * Le balayage vers la gauche pose la même question que le bouton.
     *
     * Il envoyait la tâche à demain sans rien demander, quand le bouton juste
     * en dessous, portant le même mot, ouvrait « Quand ? » : deux gestes qui
     * disent « plus tard » et ne font pas la même chose.
     *
     * La carte revient d'elle-même en place, puisque rien n'a encore bougé — et
     * c'est le choix, ensuite, qui l'envoie en fin de paquet.
     */
    onSwipeLeft: () => {
      try {
        navigator.vibrate?.(10);
      } catch {
        /* ignore */
      }
      if (onReschedule) setWhenOpen(true);
      else onPostpone();
    },
  });

  const screenW = typeof window !== "undefined" ? window.innerWidth : 400;
  const limit = Math.min((ref.current?.clientWidth ?? screenW) * 0.28, 112);

  const style = useMemo(() => {
    if (!isTop) {
      const scale = depth === 1 ? 0.96 : 0.91;
      const opacity = depth === 1 ? 0.92 : 0.8;
      const yOffset = depth * 9;
      return {
        transform: `translateY(${yOffset}px) scaleX(${scale})`,
        opacity,
        transition: "transform 0.25s ease, opacity 0.25s ease",
        zIndex: 10 - depth,
      } as React.CSSProperties;
    }
    const rot = Math.max(-15, Math.min(15, (state.dx / screenW) * 30));
    return {
      transform: `translate(${state.dx}px, ${state.dy * 0.2}px) rotate(${rot}deg)`,
      transition: state.active
        ? "none"
        : "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
      zIndex: 20,
    } as React.CSSProperties;
  }, [depth, isTop, state.active, state.dx, state.dy, screenW]);

  const doneOpacity = isTop ? Math.max(0, Math.min(1, state.dx / limit)) : 0;
  const postponeOpacity = isTop
    ? Math.max(0, Math.min(1, -state.dx / limit))
    : 0;

  const subtasks = task.subtasks ?? [];
  const note = task.note ?? "";
  /*
   * Une tâche nue n'a rien à montrer sous son titre.
   *
   * La carte est dimensionnée pour accueillir des étapes et une note ; quand il
   * n'y en a pas, le titre restait petit en haut d'un grand vide. Il grossit
   * alors pour occuper la carte. Avec des détails, le titre laisse la place
   * aux étapes et à la note.
   */
  const bare = subtasks.length === 0 && !note.trim();
  const doneSubs = subtasks.filter((s) => s.done).length;

  const submitSubtask = () => {
    const v = subDraft.trim();
    if (!v) return;
    onAddSubtask?.(v);
    setSubDraft("");
    subInputRef.current?.focus();
  };

  return (
    <div
      ref={ref}
      className="swipe-card absolute inset-0 select-none"
      data-dragging={state.active}
      aria-hidden={!isTop}
      {...(!isTop ? { inert: "" } : {})}
      style={{
        ...style,
        touchAction: "pan-y",
        cursor: isTop ? (state.active ? "grabbing" : "grab") : undefined,
      }}
    >
      <div
        className={`focus-card ${bare ? "is-bare" : "has-details"} relative w-full h-full bg-idayal-bg-elev dark:bg-idayal-bg-dark-elev rounded-card shadow-card border border-idayal-border dark:border-idayal-border-dark flex flex-col p-4 overflow-hidden`}
      >
        {/*
          Le statut et les commandes occupent une ligne séparée du titre.
          Le titre reste centré et conserve sa propre zone de respiration.
        */}
        {isTop && (
          <div className="card-topline relative flex items-center gap-1.5 mb-1">
            <span className="card-kicker">
              <span className="status-dot" />{" "}
              {isFuture ? "Pour plus tard" : isPinned ? "Épinglée" : "À faire"}
            </span>
            {onTogglePin && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePin();
                }}
                aria-pressed={isPinned}
                aria-label={isPinned ? "Désépingler" : "Épingler"}
                title={isPinned ? "Désépingler" : "Épingler"}
                className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition active:scale-90 ${
                  isPinned
                    ? "bg-idayal-blue-soft dark:bg-idayal-blue/20 text-idayal-blue dark:text-idayal-blue-light"
                    : "text-zinc-300 dark:text-zinc-700 hover:text-idayal-blue"
                }`}
              >
                <Icon name="pin" size={17} />
              </button>
            )}

            {/*
              L'échéance est un bouton, pas une étiquette. Sans heure posée, il
              se réduit au seul calendrier : proposer « Choisir un moment » en
              toutes lettres pesait plus lourd que la tâche elle-même.
            */}
            {onReschedule && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setWhenOpen(true);
                }}
                aria-label="Choisir un moment"
                title="Choisir un moment"
                className="flex-shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-full bg-idayal-blue-soft dark:bg-idayal-blue/15 text-idayal-blue dark:text-idayal-blue-light text-[12.5px] font-semibold tabular active:scale-95 transition"
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
                  <rect x="3" y="5" width="18" height="16" rx="3" />
                  <path d="M8 3v4M16 3v4M3 10h18" />
                </svg>
                {task.scheduledDate &&
                  (isFuture || task.scheduledDate.length > 10) && (
                    <>
                      {new Date(
                        task.scheduledDate.length > 10
                          ? task.scheduledDate
                          : `${task.scheduledDate}T00:00:00`,
                      ).toLocaleString("fr-FR", {
                        ...(isFuture
                          ? ({ day: "numeric", month: "short" } as const)
                          : {}),
                        ...(task.scheduledDate.length > 10
                          ? ({ hour: "2-digit", minute: "2-digit" } as const)
                          : {}),
                      })}
                      <span aria-hidden className="opacity-60 text-[10px]">
                        ▾
                      </span>
                    </>
                  )}
              </button>
            )}
          </div>
        )}

        <div
          className={`card-title-area relative flex flex-col items-center text-center gap-2 pb-2.5 ${bare ? "flex-1" : ""}`}
        >
          {task.isCarriedOver && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-idayal-orange-soft dark:bg-idayal-orange/15 text-idayal-orange text-[10.5px] font-semibold uppercase tracking-[0.06em]">
              <svg
                viewBox="0 0 24 24"
                width="11"
                height="11"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 11a8 8 0 1 0-2.3 5.7" />
                <path d="M20 5v6h-6" />
              </svg>
              Reportée
            </span>
          )}

          {isTop && onEditTitle ? (
            <EditableTaskTitle
              title={task.title}
              onSave={onEditTitle}
              editing={editingTitle}
              onEditingChange={setEditingTitle}
              variant="card"
              className="card-title"
            />
          ) : (
            <p
              className={`card-title font-semibold text-idayal-text dark:text-zinc-100 tracking-tight2 ${bare ? "text-[38px] leading-[1.1]" : "text-[21px] leading-snug"}`}
            >
              {task.title || "Tâche"}
            </p>
          )}
        </div>

        {/* Étapes et note — zone interactive, hors du geste de balayage */}
        {isTop && (
          <div
            data-swipe-ignore
            className={`card-details relative min-h-0 overflow-y-auto no-scrollbar ${bare ? "" : "flex-1"}`}
            style={{ touchAction: "pan-y" }}
          >
            {subtasks.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center gap-2 px-1 mb-1.5">
                  <span className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-idayal-text-muted dark:text-zinc-500">
                    Étapes
                  </span>
                  <span className="text-[10.5px] font-semibold text-idayal-blue tabular">
                    {doneSubs}/{subtasks.length}
                  </span>
                  <span className="flex-1 h-px bg-idayal-border dark:bg-idayal-border-dark" />
                </div>
                <ul className="space-y-1">
                  {subtasks.map((s) => (
                    <li
                      key={s.id}
                      className="group flex items-center gap-2.5 px-1 py-1"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleSubtask?.(s.id)}
                        aria-label={s.done ? "Décocher" : "Cocher"}
                        className={`w-[18px] h-[18px] rounded-md border-2 flex items-center justify-center flex-shrink-0 transition ${
                          s.done
                            ? "bg-idayal-blue border-idayal-blue"
                            : "border-zinc-300 dark:border-zinc-600 active:scale-90"
                        }`}
                      >
                        {s.done && (
                          <svg
                            viewBox="0 0 24 24"
                            width="11"
                            height="11"
                            fill="none"
                            stroke="white"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M5 12.5l4.5 4.5L20 7" />
                          </svg>
                        )}
                      </button>
                      <span
                        className={`flex-1 text-[14px] leading-snug break-words ${
                          s.done
                            ? "text-idayal-text-muted line-through"
                            : "text-idayal-text dark:text-zinc-200"
                        }`}
                      >
                        {s.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteSubtask?.(s.id)}
                        aria-label="Retirer l'étape"
                        className="mouse-only opacity-0 group-hover:opacity-100 text-idayal-text-muted hover:text-red-500 transition"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="13"
                          height="13"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                        >
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {subOpen && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitSubtask();
                }}
                className="flex items-center gap-2 px-1 mb-2"
              >
                <span className="w-[18px] h-[18px] rounded-md border-2 border-dashed border-idayal-blue/50 flex-shrink-0" />
                <input
                  ref={subInputRef}
                  autoFocus
                  value={subDraft}
                  onChange={(e) => setSubDraft(e.target.value)}
                  onBlur={() => {
                    submitSubtask();
                    setSubOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setSubDraft("");
                      setSubOpen(false);
                    }
                  }}
                  placeholder="Une étape…"
                  className="flex-1 bg-transparent outline-none text-[14px] text-idayal-text dark:text-zinc-100 border-b border-idayal-blue/40 pb-0.5"
                  enterKeyHint="done"
                />
              </form>
            )}

            {(noteOpen || note) && (
              <div className="px-1 mb-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-idayal-text-muted dark:text-zinc-500">
                    Note
                  </span>
                  <span className="flex-1 h-px bg-idayal-border dark:bg-idayal-border-dark" />
                </div>
                <textarea
                  value={note}
                  autoFocus={noteOpen && !note}
                  onChange={(e) => onSetNote?.(e.target.value)}
                  onBlur={() => setNoteOpen(false)}
                  placeholder="Ce que tu veux retenir…"
                  rows={2}
                  className="w-full resize-none bg-amber-50 dark:bg-amber-500/10 border border-amber-200/70 dark:border-amber-400/20 rounded-row p-2.5 text-[14px] leading-snug text-idayal-text dark:text-zinc-200 outline-none focus:border-amber-400/60 placeholder:text-idayal-text-muted"
                />
              </div>
            )}
          </div>
        )}

        {/* Ajouts rapides */}
        {isTop && (
          <div className="card-additions relative flex gap-2 pt-1 pb-1.5">
            <button
              type="button"
              onClick={() => setSubOpen(true)}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-zinc-100/80 dark:bg-zinc-800/60 text-idayal-text-secondary dark:text-zinc-300 text-[12px] font-semibold active:scale-95 hover:text-idayal-blue transition"
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Étape
            </button>
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-zinc-100/80 dark:bg-zinc-800/60 text-idayal-text-secondary dark:text-zinc-300 text-[12px] font-semibold active:scale-95 hover:text-idayal-blue transition"
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
                <path d="M5 4h11l4 4v12H5z" />
                <path d="M9 12h6M9 16h4" />
              </svg>
              Note
            </button>
            {onRecurrenceChange && (
              <RecurrenceControl
                value={task.recurrence}
                scheduledDate={task.scheduledDate}
                onChange={onRecurrenceChange}
              />
            )}
          </div>
        )}

        {/* Chrono et minuteur — fonction secondaire, une ligne sous la tâche. */}
        {isTop && <CardTimer taskId={task.id} />}

        {/* Actions cliquables — indispensables sur ordinateur */}
        {isTop && (
          <div className="card-actions relative flex gap-2 pt-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                try {
                  navigator.vibrate?.(10);
                } catch {
                  /* ignore */
                }
                /*
                 * Le bouton et le glissement ouvrent la même feuille de choix
                 * d’échéance, qui ne permet pas de reprogrammer dans le passé.
                 */
                if (onReschedule) setWhenOpen(true);
                else onPostpone();
              }}
              className="postpone-action flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-idayal-orange-soft dark:bg-idayal-orange/15 text-idayal-orange font-semibold text-[14px] active:scale-95 hover:bg-idayal-orange/20 dark:hover:bg-idayal-orange/25 transition"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Plus tard
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                try {
                  navigator.vibrate?.(15);
                } catch {
                  /* ignore */
                }
                onDone();
              }}
              className="done-action flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-idayal-blue text-white font-semibold text-[14px] shadow-[0_4px_12px_rgba(61,186,142,0.30)] active:scale-95 hover:bg-idayal-blue-dark transition"
            >
              Fait
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12.5l4.5 4.5L20 7" />
              </svg>
            </button>
          </div>
        )}

        {/* Overlays swipe */}
        <div
          className="swipe-feedback swipe-feedback-done absolute inset-0 rounded-card flex flex-col items-center justify-center bg-idayal-blue/92 text-white pointer-events-none"
          style={{ opacity: doneOpacity }}
        >
          <svg
            viewBox="0 0 24 24"
            width="64"
            height="64"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.5l4.5 4.5L20 7" />
          </svg>
          <span className="mt-2 text-2xl font-bold tracking-tight2">Fait</span>
        </div>
        <div
          className="swipe-feedback swipe-feedback-later absolute inset-0 rounded-card flex flex-col items-center justify-center bg-idayal-orange/92 text-white pointer-events-none"
          style={{ opacity: postponeOpacity }}
        >
          <svg
            viewBox="0 0 24 24"
            width="64"
            height="64"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span className="mt-2 text-2xl font-bold tracking-tight2">
            Plus tard
          </span>
        </div>
      </div>

      {/* Posée hors de la carte : elle couvre l'écran et ne suit pas le balayage. */}
      {onReschedule && (
        <WhenSheet
          open={whenOpen}
          title={task.title}
          current={task.scheduledDate}
          onPick={onReschedule}
          onClose={() => setWhenOpen(false)}
        />
      )}
    </div>
  );
}
