import { useMemo } from "react";
import type { Task } from "../types/task";
import { TaskRow } from "./TaskRow";
import { Icon } from "./Icon";
interface Props {
  tasks: Task[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEditTitle: (id: string, title: string) => void;
  onPin: (id: string) => void;
  onClearCompleted: () => void;
  pinnedTaskId: string | null;
  onOpenCard: (id: string) => void;
  onStart: () => void;
}
export function TodayView({
  tasks,
  onToggle,
  onDelete,
  onEditTitle,
  onPin,
  onClearCompleted,
  pinnedTaskId,
  onOpenCard,
  onStart,
}: Props) {
  const { pending, done } = useMemo(
    () => ({
      pending: tasks
        .filter((t) => !t.completedDate)
        .sort(
          (a, b) =>
            Number(!!b.isPinned) - Number(!!a.isPinned) ||
            ((a.scheduledDate?.length ?? 0) > 10
              ? a.scheduledDate!
              : "z"
            ).localeCompare(
              (b.scheduledDate?.length ?? 0) > 10 ? b.scheduledDate! : "z",
            ),
        ),
      done: tasks.filter((t) => t.completedDate),
    }),
    [tasks],
  );
  const now = new Date();
  const regular = pending.filter((t) => !t.recurrence);
  const recurring = pending.filter((t) => !!t.recurrence);
  const top = pending[0];
  const row = (t: Task) => (
    <TaskRow
      key={t.id}
      task={t}
      onToggle={onToggle}
      onDelete={onDelete}
      onEditTitle={onEditTitle}
      onPin={onPin}
      isPinned={pinnedTaskId === t.id}
      onOpenCard={onOpenCard}
    />
  );
  return (
    <section className="today-view page-view">
      <header className="page-heading">
        <div>
          <p className="eyebrow">TA JOURNÉE, À TON RYTHME</p>
          <h1>
            {now.toLocaleDateString("fr-FR", { weekday: "long" })}
            <span>
              {now.toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
              })}
            </span>
          </h1>
          <p className="page-description">
            {pending.length
              ? `${pending.length} chose${pending.length > 1 ? "s" : ""} à faire. Une à la fois.`
              : "De la place pour ce qui compte."}
          </p>
        </div>
        <div className="day-stamp" aria-hidden="true">
          <Icon name="sun" size={25} />
          <span>{now.toLocaleDateString("fr-FR", { month: "short" })}</span>
          <strong>{now.getDate()}</strong>
        </div>
      </header>
      <div className="today-content scroll-content">
        <div className="daily-list">
          <div className="section-heading">
            <h2>Le fil du jour</h2>
            <span>
              {regular.length ? `${regular.length} à faire` : "Aujourd'hui"}
            </span>
          </div>
          {tasks.length === 0 ? (
            <div className="empty-day">
              <div className="empty-illustration">
                <Icon name="sun" size={45} />
              </div>
              <h2>
                Tout commence
                <br />
                par une petite chose.
              </h2>
              <p>
                Une idée, un rendez-vous, une envie.
                <br />
                Pose-la ici pour libérer ton esprit.
              </p>
              <button className="primary-button" onClick={onStart}>
                <Icon name="plus" size={18} /> Noter ma première tâche
              </button>
              <span className="empty-example">
                Essaie « appeler Marie demain à 10h »
              </span>
            </div>
          ) : (
            <ul className="task-list">{regular.map(row)}</ul>
          )}
          {recurring.length > 0 && (
            <section
              className="recurring-section"
              aria-label="Tâches récurrentes"
            >
              <div className="section-heading recurring-heading">
                <h2>Récurrentes</h2>
                <span>{recurring.length} à faire</span>
              </div>
              <ul className="task-list recurring-list">{recurring.map(row)}</ul>
            </section>
          )}
          {done.length > 0 && (
            <>
              <div className="section-heading done-heading">
                <h2>
                  <Icon name="check" size={15} /> C’est fait{" "}
                  <span>{done.length}</span>
                </h2>
                <button onClick={onClearCompleted}>Effacer</button>
              </div>
              <ul className="task-list completed-list">{done.map(row)}</ul>
            </>
          )}
          {pending.length > 0 && (
            <p className="daily-footnote">
              <Icon name="leaf" size={14} /> Ce qui reste trouvera sa place
              demain.
            </p>
          )}
        </div>
        <aside className="focus-aside">
          <div className="section-heading">
            <h2>Un peu de focus</h2>
            <Icon name="cards" size={17} />
          </div>
          <button
            className="focus-preview"
            onClick={() => (top ? onOpenCard(top.id) : onStart())}
          >
            <span className="focus-kicker">
              <span className="status-dot" />
              {top ? "JUSTE MAINTENANT" : "UNE CHOSE À LA FOIS"}
            </span>
            <div className="focus-preview-body">
              <Icon name={top ? "cards" : "leaf"} size={30} />
              <h2>{top?.title ?? "Moins de bruit.\nPlus de place."}</h2>
              <p>
                {top
                  ? "Laisse le reste de côté,\nle temps de cette carte."
                  : "Ta journée n’a pas besoin\nd’être une course."}
              </p>
            </div>
            <span className="focus-preview-link">
              {top ? "Ouvrir la carte" : "Noter une tâche"}
              <Icon name="arrow" size={19} />
            </span>
          </button>
          <p className="aside-caption">
            Un geste pour terminer.
            <br />
            Un autre pour choisir le bon moment.
          </p>
        </aside>
      </div>
    </section>
  );
}
