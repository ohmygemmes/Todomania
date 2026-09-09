import { useEffect, useMemo, useState } from "react";
import { orderDeck } from "../services/stack";
import type { RecurrenceRule, Task } from "../types/task";
import { Icon } from "./Icon";
import { CompletionScreen } from "./CompletionScreen";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { WhenSheet } from "./WhenSheet";
import { SwipeCard } from "./SwipeCard";

interface Props {
  todayTasks: Task[];
  laterTasks: Task[];
  pinnedTaskId: string | null;
  /** Demande la complétion ; App arbitre les confirmations éventuelles. */
  onComplete: (id: string) => void;
  onPostpone: (id: string) => void;
  onPromoteToTop: (id: string) => void;
  onInspectTask: (id: string) => void;
  onEditTitle: (id: string, title: string) => void;
  onRecurrenceChange: (id: string, recurrence: RecurrenceRule | null) => void;
  /** Pose l'échéance choisie dans la feuille « Quand ? ». */
  onReschedule: (id: string, scheduledDate: string) => void;
  /** Met la tâche en tête du paquet, ou l'en retire si elle y est déjà. */
  onTogglePin: (id: string) => void;
  /** Tâche remontée en tête depuis le paquet, le temps de la session. */
  deckFront: string | null;
  /** Tâches déjà arbitrées, renvoyées en fin de paquet. */
  deckBack: string[];
  onPushBack: (id: string) => void;
  onSetNote: (id: string, text: string) => void;
  onAddSubtask: (taskId: string, title: string) => void;
  onToggleSubtask: (taskId: string, subId: string) => void;
  onDeleteSubtask: (taskId: string, subId: string) => void;
}

function formatLaterDate(iso: string): string {
  const hasTime = iso.length > 10;
  const d = hasTime ? new Date(iso) : new Date(iso + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = hasTime
    ? {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }
    : { weekday: "short", day: "numeric", month: "short" };
  return d.toLocaleString("fr-FR", opts);
}

export function CardsView({
  todayTasks,
  laterTasks,
  pinnedTaskId,
  onComplete,
  onPostpone,
  onReschedule,
  onTogglePin,
  deckFront,
  deckBack,
  onPushBack,
  onPromoteToTop,
  onInspectTask,
  onEditTitle,
  onRecurrenceChange,
  onSetNote,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
}: Props) {
  const stack = useMemo(
    () => orderDeck(todayTasks, deckFront, deckBack),
    [todayTasks, deckFront, deckBack],
  );

  const handleReschedule = (id: string, scheduledDate: string) => {
    onReschedule(id, scheduledDate);
    onPushBack(id);
  };

  /**
   * Dérivé des données plutôt que compté à la volée : le compteur survit à un
   * changement d'onglet et reste juste si l'utilisateur annule une complétion.
   */
  const doneCount = useMemo(
    () => todayTasks.filter((t) => !!t.completedDate).length,
    [todayTasks],
  );
  const [deckOpen, setDeckOpen] = useState(false);
  const [keyboardWhen, setKeyboardWhen] = useState(false);

  // Ferme le deck si plus de tâches
  useEffect(() => {
    if (stack.length === 0) setDeckOpen(false);
  }, [stack.length]);

  const total = stack.length + doneCount;
  const visible = stack.slice(0, 3);

  const handleDone = (id: string) => {
    onComplete(id);
  };

  const handlePostpone = (id: string) => {
    onPostpone(id);
  };

  // Flèches gauche/droite = équivalent clavier du swipe (ordinateur).
  const top = stack[0];
  useEffect(() => {
    if (!top || deckOpen || keyboardWhen) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        handleDone(top.id);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setKeyboardWhen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top, deckOpen, keyboardWhen, onComplete]);

  const handlePromote = (id: string) => {
    onPromoteToTop(id);
    setDeckOpen(false);
  };

  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const laterSorted = useMemo(
    () =>
      [...laterTasks].sort((a, b) =>
        (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? ""),
      ),
    [laterTasks],
  );

  return (
    <div className="cards-view page-view flex flex-col h-full">
      <header className="page-heading cards-heading">
        <div>
          <h1>Une chose à la fois.</h1>
        </div>
        <span className="cards-count">
          {stack.length} carte{stack.length > 1 ? "s" : ""}
        </span>
      </header>
      <div className="swipe-guide">
        <span>← Choisir un autre moment</span>
        <span>Terminer →</span>
      </div>
      {/*
        La réserve du bas ne couvre plus que ce qu'il y a dessous.
        192 px étaient gardés pour la barre de saisie et les onglets, qui en
        occupent une quarantaine de moins : c'est autant de hauteur rendue à la
        carte, qui en manque dès qu'une tâche porte des étapes et une note.
      */}
      <div className="cards-stage flex-1 min-h-0 px-5 pb-40 flex flex-col">
        {stack.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <CompletionScreen total={doneCount} />
          </div>
        ) : (
          /*
            La carte prend la hauteur disponible.
            Le plafond de 520 px laissait un grand vide au milieu quand la tâche
            était courte, et écrasait les étapes et la note dès qu'on en ajoutait
            — c'est-à-dire précisément quand la carte a le plus à montrer.
          */
          <div className="card-stack relative flex-1 min-h-0 mt-3">
            {visible.map((t, i) => (
              <SwipeCard
                key={t.id}
                task={t}
                depth={i}
                onDone={() => handleDone(t.id)}
                onPostpone={() => handlePostpone(t.id)}
                onReschedule={(iso) => handleReschedule(t.id, iso)}
                isPinned={!!t.isPinned}
                onTogglePin={() => onTogglePin(t.id)}
                onEditTitle={(title) => onEditTitle(t.id, title)}
                onRecurrenceChange={(rule) => onRecurrenceChange(t.id, rule)}
                onSetNote={(text) => onSetNote(t.id, text)}
                onAddSubtask={(title) => onAddSubtask(t.id, title)}
                onToggleSubtask={(subId) => onToggleSubtask(t.id, subId)}
                onDeleteSubtask={(subId) => onDeleteSubtask(t.id, subId)}
              />
            ))}
          </div>
        )}

        {total > 0 && stack.length > 0 && (
          <div className="deck-footer mt-5 px-1">
            <div className="flex justify-between items-baseline text-[12px] mb-1.5">
              <span className="text-idayal-text-secondary dark:text-zinc-400">
                <span className="tabular font-semibold text-idayal-text dark:text-zinc-200">
                  {doneCount}
                </span>{" "}
                / {total} terminée{total > 1 ? "s" : ""}
              </span>
              <span className="tabular font-semibold text-idayal-blue">
                {pct}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-zinc-200/70 dark:bg-zinc-800/70 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-idayal-blue to-idayal-blue-dark transition-all duration-500 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Bouton "déployer le paquet" */}
            <button
              type="button"
              onClick={() => setDeckOpen(true)}
              className="deck-open-button mt-3 w-full flex items-center justify-center gap-2 h-11 rounded-2xl bg-idayal-bg-elev dark:bg-idayal-bg-dark-elev border border-idayal-border dark:border-idayal-border-dark shadow-soft text-idayal-text-secondary dark:text-zinc-300 font-medium text-[13.5px] active:scale-[0.99] hover:text-idayal-blue transition"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="4" y="6" width="6" height="14" rx="1.5" />
                <rect
                  x="10"
                  y="4"
                  width="6"
                  height="14"
                  rx="1.5"
                  transform="rotate(6 13 11)"
                />
                <rect
                  x="15"
                  y="6"
                  width="6"
                  height="14"
                  rx="1.5"
                  transform="rotate(12 18 13)"
                />
              </svg>
              Voir tout le paquet ({stack.length + laterSorted.length})
            </button>
          </div>
        )}
      </div>

      {top && (
        <WhenSheet
          open={keyboardWhen}
          title={top.title}
          current={top.scheduledDate}
          onPick={(iso) => handleReschedule(top.id, iso)}
          onClose={() => setKeyboardWhen(false)}
        />
      )}
      <DeckPanel
        open={deckOpen}
        onClose={() => setDeckOpen(false)}
        todayStack={stack}
        laterTasks={laterSorted}
        pinnedTaskId={pinnedTaskId}
        onPickToday={handlePromote}
        onPickLater={(id) => {
          setDeckOpen(false);
          onInspectTask(id);
        }}
        formatLaterDate={formatLaterDate}
      />
    </div>
  );
}

interface DeckPanelProps {
  open: boolean;
  onClose: () => void;
  todayStack: Task[];
  laterTasks: Task[];
  pinnedTaskId: string | null;
  onPickToday: (id: string) => void;
  onPickLater: (id: string) => void;
  formatLaterDate: (iso: string) => string;
}

function DeckPanel({
  open,
  onClose,
  todayStack,
  laterTasks,
  pinnedTaskId,
  onPickToday,
  onPickLater,
  formatLaterDate,
}: DeckPanelProps) {
  const dialogRef = useDialogFocus(open, onClose);
  if (!open) return null;
  return (
    <div
      className={`fixed inset-0 z-40 ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      role="dialog"
      aria-modal="true"
      aria-label="Ton paquet"
      ref={dialogRef}
      tabIndex={-1}
    >
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`deck-sheet absolute left-1/2 -translate-x-1/2 bottom-0 w-full max-w-app bg-idayal-bg dark:bg-idayal-bg-dark rounded-t-[28px] shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{
          maxHeight: "85vh",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-9 h-1 rounded-full bg-idayal-border dark:bg-idayal-border-dark" />
        </div>
        <div className="flex items-center justify-between px-5 pt-1 pb-3">
          <div>
            <h2 className="text-[20px] font-bold text-idayal-text dark:text-zinc-100 tracking-tight2">
              Ton paquet
            </h2>
            <p className="text-[12px] text-idayal-text-secondary dark:text-zinc-400">
              Choisis une carte, ou consulte celles de plus tard.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 text-idayal-text-secondary dark:text-zinc-300 flex items-center justify-center active:scale-90 transition"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div
          className="overflow-y-auto no-scrollbar px-4 pb-6"
          style={{ maxHeight: "calc(85vh - 70px)" }}
        >
          {/* Aujourd'hui */}
          <div className="px-1 mb-2 flex items-center gap-2">
            <h3 className="text-[11px] uppercase tracking-[0.08em] font-semibold text-idayal-text-muted dark:text-zinc-500">
              Aujourd'hui
            </h3>
            <span className="text-[11px] font-semibold text-idayal-blue tabular">
              {todayStack.length}
            </span>
            <span className="flex-1 h-px bg-idayal-border dark:bg-idayal-border-dark" />
          </div>
          {todayStack.length === 0 ? (
            <p className="text-[13px] text-idayal-text-muted italic px-2 py-3">
              Rien à faire aujourd'hui.
            </p>
          ) : (
            <ul>
              {todayStack.map((t, i) => (
                <DeckRow
                  key={t.id}
                  task={t}
                  color="blue"
                  index={i}
                  isPinned={pinnedTaskId === t.id}
                  onClick={() => onPickToday(t.id)}
                />
              ))}
            </ul>
          )}

          {/* Séparateur + Plus tard */}
          {laterTasks.length > 0 && (
            <>
              <div className="px-1 mt-6 mb-2 flex items-center gap-2">
                <h3 className="text-[11px] uppercase tracking-[0.08em] font-semibold text-idayal-text-muted dark:text-zinc-500">
                  Plus tard
                </h3>
                <span className="text-[11px] font-semibold text-idayal-blue tabular">
                  {laterTasks.length}
                </span>
                <span className="flex-1 h-px bg-idayal-border dark:bg-idayal-border-dark" />
              </div>
              <ul>
                {laterTasks.map((t) => (
                  <DeckRow
                    key={t.id}
                    task={t}
                    color="orange"
                    subLabel={
                      t.scheduledDate ? formatLaterDate(t.scheduledDate) : null
                    }
                    onClick={() => onPickLater(t.id)}
                  />
                ))}
              </ul>
              <p className="text-[11px] text-idayal-text-muted italic px-2 mt-2">
                Taper une tâche « Plus tard » la ramène à aujourd'hui.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface DeckRowProps {
  task: Task;
  color: "blue" | "orange";
  index?: number;
  isPinned?: boolean;
  subLabel?: string | null;
  onClick: () => void;
}

function DeckRow({
  task,
  color,
  index,
  isPinned,
  subLabel,
  onClick,
}: DeckRowProps) {
  const badgeColor =
    color === "blue"
      ? "bg-idayal-blue-soft text-idayal-blue"
      : "bg-idayal-orange-soft text-idayal-orange";
  return (
    <li className="mb-2">
      <button
        type="button"
        onClick={onClick}
        className={`w-full flex items-center gap-3 pl-3 pr-3 py-3 rounded-row bg-idayal-bg-elev dark:bg-idayal-bg-dark-elev border shadow-soft active:scale-[0.99] transition text-left ${
          isPinned
            ? "border-idayal-blue/60 shadow-[0_2px_8px_rgba(59,125,216,0.15)]"
            : "border-idayal-border dark:border-idayal-border-dark hover:border-idayal-blue/40"
        }`}
      >
        {/* Icône carte ou numéro */}
        <span
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${badgeColor} dark:bg-opacity-25`}
        >
          {typeof index === "number" ? (
            <span className="text-[12px] font-bold tabular">{index + 1}</span>
          ) : (
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 9h18M8 3v4M16 3v4" />
            </svg>
          )}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-[15px] leading-snug text-idayal-text dark:text-zinc-100 tracking-tightish truncate">
            {task.title || "Tâche"}
          </p>
          {subLabel && (
            <p className="text-[12px] text-idayal-blue tabular font-medium mt-0.5">
              {subLabel}
            </p>
          )}
          {isPinned && (
            <p className="text-[11px] text-idayal-blue font-semibold uppercase tracking-[0.06em] mt-0.5">
              <Icon name="pin" size={12} /> Épinglée
            </p>
          )}
        </div>

        <svg
          className="text-idayal-text-muted flex-shrink-0"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </li>
  );
}
