import { useState } from "react";
import type { RecurrenceRule, Task } from "../types/task";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { toLocalISODate } from "../services/localDate";
import { EditableTaskTitle } from "./EditableTaskTitle";
import { RecurrenceControl } from "./RecurrenceControl";
import { Icon } from "./Icon";

interface Props {
  task: Task;
  onClose: () => void;
  onOpenCard: (id: string) => void;
  onEditTitle: (id: string, title: string) => void;
  onSetNote: (id: string, text: string) => void;
  onToggleSubtask: (id: string, subId: string) => void;
  onRecurrenceChange: (id: string, recurrence: RecurrenceRule | null) => void;
}

/** Opening a task is read-only; changing its day always needs the explicit footer action. */
export function TaskPreviewSheet({
  task,
  onClose,
  onOpenCard,
  onEditTitle,
  onSetNote,
  onToggleSubtask,
  onRecurrenceChange,
}: Props) {
  const ref = useDialogFocus(true, onClose);
  const [editing, setEditing] = useState(false);
  const future =
    !!task.scheduledDate &&
    task.scheduledDate.slice(0, 10) > toLocalISODate(new Date());
  const date =
    task.scheduledDate &&
    new Date(
      task.scheduledDate.length > 10
        ? task.scheduledDate
        : task.scheduledDate + "T00:00:00",
    );
  return (
    <div
      className="utility-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Consulter la tâche"
      tabIndex={-1}
      ref={ref}
    >
      <div className="utility-backdrop" onClick={onClose} />
      <section className="utility-sheet task-preview-sheet">
        <div className="sheet-handle" />
        <header className="utility-heading">
          <span className="preview-status">
            <Icon name={task.completedDate ? "check" : "calendar"} size={17} />
            {task.completedDate
              ? "Terminée"
              : future
                ? "Prévue pour plus tard"
                : "Aujourd’hui"}
          </span>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Fermer la tâche"
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="task-preview-content">
          <EditableTaskTitle
            title={task.title}
            variant="card"
            editing={editing}
            onEditingChange={setEditing}
            onSave={(title) => onEditTitle(task.id, title)}
            className="card-title"
          />
          {date && (
            <p className="preview-date">
              {date.toLocaleString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                ...(task.scheduledDate!.length > 10
                  ? { hour: "2-digit", minute: "2-digit" }
                  : {}),
              })}
            </p>
          )}
          {!!task.subtasks?.length && (
            <div className="preview-steps">
              <h3>Étapes</h3>
              {task.subtasks.map((step) => (
                <label key={step.id}>
                  <input
                    type="checkbox"
                    checked={step.done}
                    onChange={() => onToggleSubtask(task.id, step.id)}
                  />
                  <span>{step.title}</span>
                </label>
              ))}
            </div>
          )}
          <label className="preview-note">
            Note
            <textarea
              value={task.note ?? ""}
              onChange={(event) => onSetNote(task.id, event.target.value)}
              placeholder="Ce que tu veux retenir…"
              rows={4}
            />
          </label>
          {!task.completedDate && (
            <RecurrenceControl
              value={task.recurrence}
              scheduledDate={task.scheduledDate}
              onChange={(rule) => onRecurrenceChange(task.id, rule)}
            />
          )}
        </div>
        {!task.completedDate && (
          <footer className="preview-footer">
            <button
              className="primary-button"
              onClick={() => onOpenCard(task.id)}
            >
              <Icon name="cards" size={19} />
              {future ? "Faire aujourd’hui" : "Ouvrir dans Cartes"}
              <Icon name="arrow" size={18} />
            </button>
            {future && (
              <p>La tâche reste à sa date tant que tu ne la déplaces pas.</p>
            )}
          </footer>
        )}
      </section>
    </div>
  );
}
