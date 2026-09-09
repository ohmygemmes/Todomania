import { useState } from "react";
import { useSwipeGesture } from "../hooks/useSwipeGesture";
import { Icon } from "./Icon";
import { EditableTaskTitle } from "./EditableTaskTitle";
import type { Task } from "../types/task";

interface Props {
  task: Task;
  onToggle: (id: string) => void;
  onDelete?: (id: string) => void;
  onEditTitle?: (id: string, title: string) => void;
  onBringToToday?: (id: string) => void;
  onPin?: (id: string) => void;
  isPinned?: boolean;
  showDate?: boolean;
  onOpenCard?: (id: string) => void;
}

interface ScheduleInfo {
  label: string;
  hasTime: boolean;
  overdue: boolean;
}

/**
 * Dans « Plus tard » on affiche la date complète.
 * Dans « Aujourd'hui » la date est évidente : on n'affiche que l'heure, si elle existe.
 */
function scheduleInfo(
  iso: string | null,
  showFullDate: boolean,
): ScheduleInfo | null {
  if (!iso) return null;
  const hasTime = iso.length > 10;
  if (!showFullDate && !hasTime) return null;
  const d = hasTime ? new Date(iso) : new Date(iso + "T00:00:00");
  const label = showFullDate
    ? d.toLocaleString(
        "fr-FR",
        hasTime
          ? {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            }
          : { weekday: "short", day: "numeric", month: "short" },
      )
    : d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return { label, hasTime, overdue: hasTime && d.getTime() < Date.now() };
}

/** Distance de glissement au-delà de laquelle on supprime. */
const DELETE_THRESHOLD = 96;

export function TaskRow({
  task,
  onToggle,
  onDelete,
  onEditTitle,
  onBringToToday,
  onPin,
  isPinned = false,
  showDate = false,
  onOpenCard,
}: Props) {
  const [exiting, setExiting] = useState(false);
  const [editing, setEditing] = useState(false);
  const completed = !!task.completedDate;

  const removeWithAnimation = () => {
    if (!onDelete) return;
    setExiting(true);
    window.setTimeout(() => onDelete(task.id), 260);
  };

  // Glisser vers la gauche supprime. Le geste est désactivé pendant l'édition.
  const { ref: swipeRef, state: swipe } = useSwipeGesture<HTMLLIElement>({
    enabled: !!onDelete && !editing && !exiting,
    threshold: DELETE_THRESHOLD,
    onSwipeLeft: () => {
      try {
        navigator.vibrate?.(12);
      } catch {
        /* ignore */
      }
      removeWithAnimation();
    },
  });

  const handleToggle = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(10);
      } catch {
        /* ignore */
      }
    }
    if (!completed) {
      setExiting(true);
      window.setTimeout(() => {
        onToggle(task.id);
        setExiting(false);
      }, 280);
    } else {
      onToggle(task.id);
    }
  };

  const schedule = scheduleInfo(task.scheduledDate, showDate);
  const carried = task.isCarriedOver && !completed;

  // On ne suit le doigt que vers la gauche.
  const dx = Math.min(0, swipe.dx);
  const revealed = Math.min(1, -dx / DELETE_THRESHOLD);

  return (
    <li
      ref={swipeRef}
      style={{ touchAction: "pan-y" }}
      className={`task-row relative overflow-hidden ${exiting ? "animate-slide-out-right" : ""}`}
    >
      {/* Fond de suppression, révélé par le glissement */}
      {onDelete && dx < 0 && (
        <div
          className="absolute inset-0 bg-red-500 flex items-center justify-end pr-5"
          style={{ opacity: 0.35 + revealed * 0.65 }}
          aria-hidden
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: `scale(${0.8 + revealed * 0.3})` }}
          >
            <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
          </svg>
        </div>
      )}

      {/*
        Une ligne, plus une carte.
        Un filet d'un pixel sépare aussi bien qu'un fond blanc arrondi, et ne coûte
        pas la hauteur qu'il prenait : on passe de six tâches visibles à onze.
        Le fond n'apparaît que pendant le glissement, pour masquer le rouge de
        suppression posé dessous.
      */}
      <div
        className="group relative flex items-start gap-3 px-1 py-3 border-b border-idayal-border dark:border-idayal-border-dark animate-slide-in-up"
        style={{
          transform: `translateX(${dx}px)`,
          transition: swipe.active
            ? "none"
            : "transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
          background: dx < 0 ? "var(--idayal-row-solid)" : undefined,
        }}
      >
        <button
          type="button"
          onClick={handleToggle}
          aria-label={completed ? "Marquer non fait" : "Marquer comme fait"}
          className={`mt-px w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
            completed
              ? "bg-idayal-blue border-[1.5px] border-idayal-blue"
              : "bg-transparent border-[1.5px] border-zinc-300 dark:border-zinc-700 hover:border-idayal-blue active:scale-90"
          }`}
        >
          {completed && (
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="white"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-check-pop"
            >
              <path d="M5 12.5l4.5 4.5L20 7" />
            </svg>
          )}
        </button>

        {/*
          Gouttière d'heure.
          Sous « Aujourd'hui » l'heure tient en cinq caractères : la poser à gauche
          plutôt que sous le titre économise une ligne par tâche, et les deux-points
          alignés donnent sa forme à la journée. Dans « Plus tard » le libellé porte
          la date entière, trop long pour une gouttière : il reste sous le titre.
        */}
        {!showDate && !completed && !editing && (
          <span
            aria-hidden={!schedule}
            className={`flex-shrink-0 w-[38px] mt-px text-[12px] font-semibold tabular text-right leading-[1.35] ${
              schedule?.overdue
                ? "text-idayal-orange"
                : "text-idayal-blue dark:text-idayal-blue-light"
            }`}
          >
            {schedule?.label ?? ""}
          </span>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1.5">
            {/*
                Une flèche qui boucle, pas une horloge.
                L'ancien pictogramme de report était le cadran exact de celui des
                heures : sur une tâche à la fois reportée et programmée, deux
                horloges se suivaient sans dire la même chose.
              */}
            {carried && !editing && (
              <span
                className="text-idayal-orange text-[11px] font-medium mt-0.5 leading-snug flex items-center gap-0.5"
                title="Reportée"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 11a8 8 0 1 0-2.3 5.7" />
                  <path d="M20 5v6h-6" />
                </svg>
              </span>
            )}
            {isPinned && !editing && (
              <span
                className="text-idayal-blue text-[11px] font-medium mt-0.5 leading-snug flex items-center gap-0.5"
                title="Épinglée"
                aria-label="Épinglée"
              >
                <Icon name="pin" size={13} />
              </span>
            )}
            {onEditTitle && !completed ? (
              <EditableTaskTitle
                title={task.title}
                onSave={(title) => onEditTitle(task.id, title)}
                editing={editing}
                onEditingChange={setEditing}
                variant="row"
                className="text-[15px] leading-snug break-words tracking-tightish text-idayal-text dark:text-zinc-100"
              />
            ) : (
              <p
                className={`text-[15px] leading-snug break-words tracking-tightish ${
                  completed
                    ? "text-idayal-text-muted line-through"
                    : "text-idayal-text dark:text-zinc-100"
                }`}
              >
                {task.title}
              </p>
            )}
          </div>

          {schedule && showDate && !completed && !editing && (
            <p
              className={`text-[12px] mt-0.5 tabular font-medium flex items-center gap-1 ${
                schedule.overdue
                  ? "text-idayal-orange"
                  : "text-idayal-blue dark:text-idayal-blue-light"
              }`}
            >
              {schedule.hasTime && (
                <svg
                  viewBox="0 0 24 24"
                  width="11"
                  height="11"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              )}
              {schedule.label}
            </p>
          )}
        </div>

        {!completed && !editing && onBringToToday && (
          <button
            type="button"
            onClick={() => onBringToToday(task.id)}
            aria-label="Faire aujourd'hui"
            title="Faire aujourd'hui"
            className="flex-shrink-0 h-8 px-3 rounded-full bg-idayal-blue-soft dark:bg-idayal-blue/20 text-idayal-blue text-[12px] font-semibold flex items-center gap-1.5 active:scale-95 hover:bg-idayal-blue/20 dark:hover:bg-idayal-blue/30 transition"
          >
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            Aujourd'hui
          </button>
        )}

        {!completed && !editing && onPin && !onBringToToday && (
          <button
            type="button"
            onClick={() => onPin(task.id)}
            aria-label={isPinned ? "Désépingler" : "Épingler"}
            title={isPinned ? "Désépingler" : "Épingler"}
            aria-pressed={isPinned}
            /*
             * Sans fond ni pastille : sept lignes affichaient sept boutons pleins.
             * L'épingle garde sa zone tactile, elle cesse d'occuper l'œil — c'est la
             * carte qui lui donne un vrai bouton.
             */
            className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition active:scale-90 ${
              isPinned
                ? "text-idayal-blue dark:text-idayal-blue-light"
                : "text-zinc-300 dark:text-zinc-700 hover:text-idayal-blue"
            }`}
          >
            <Icon name="pin" size={17} />
          </button>
        )}

        {showDate && !onBringToToday && !editing && (
          <span className="mt-0.5 w-7 h-7 rounded-full bg-idayal-blue-soft dark:bg-idayal-blue/15 flex items-center justify-center text-idayal-blue flex-shrink-0">
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
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 9h18M8 3v4M16 3v4" />
            </svg>
          </span>
        )}

        {onOpenCard && !completed && !editing && (
          <button
            type="button"
            className="row-open icon-button"
            aria-label={`Ouvrir la carte : ${task.title}`}
            onClick={() => onOpenCard(task.id)}
          >
            <Icon name="arrow" size={16} />
          </button>
        )}
        {/* Suppression à la souris. Au doigt, on glisse la ligne vers la gauche. */}
        {onDelete && !editing && (
          <button
            type="button"
            onClick={removeWithAnimation}
            className="mouse-only opacity-0 group-hover:opacity-100 focus:opacity-100 text-idayal-text-muted hover:text-red-500 transition flex-shrink-0 mt-0.5 items-center justify-center"
            aria-label="Supprimer"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>
    </li>
  );
}
