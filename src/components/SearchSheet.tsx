import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Note, Task } from "../types/task";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { toLocalISODate } from "../services/localDate";
import { searchItems } from "../services/search";
import { Icon } from "./Icon";

interface Props {
  tasks: Task[];
  notes: Note[];
  onClose: () => void;
  onSelectTask: (id: string) => void;
  onUpdateNote: (id: string, text: string) => void;
}

function taskStatus(task: Task) {
  if (task.completedDate) return "Terminée";
  if (
    !task.scheduledDate ||
    task.scheduledDate.slice(0, 10) <= toLocalISODate(new Date())
  )
    return "Aujourd’hui";
  return new Date(
    task.scheduledDate.length > 10
      ? task.scheduledDate
      : task.scheduledDate + "T00:00:00",
  ).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function SearchSheet({
  tasks,
  notes,
  onClose,
  onSelectTask,
  onUpdateNote,
}: Props) {
  const [query, setQuery] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogFocus(true, onClose);
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(
    () => searchItems(tasks, notes, deferredQuery),
    [tasks, notes, deferredQuery],
  );
  const note = notes.find((item) => item.id === noteId);
  useEffect(() => {
    if (!noteId) inputRef.current?.focus();
  }, [noteId]);
  const total = results.tasks.length + results.notes.length;
  return (
    <div
      className="utility-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Rechercher"
      tabIndex={-1}
      ref={dialogRef}
    >
      <div className="utility-backdrop" onClick={onClose} />
      <section className="utility-sheet search-sheet">
        <div className="sheet-handle" />
        <header className="utility-heading">
          <h2>{note ? "Note" : "Retrouver une idée."}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Fermer la recherche"
          >
            <Icon name="close" />
          </button>
        </header>
        {note ? (
          <div className="search-note-detail">
            <button className="text-action" onClick={() => setNoteId(null)}>
              ← Résultats
            </button>
            {note.fromTaskTitle && <h3>{note.fromTaskTitle}</h3>}
            <textarea
              aria-label="Modifier la note retrouvée"
              value={note.text}
              onChange={(event) => onUpdateNote(note.id, event.target.value)}
              rows={10}
            />
          </div>
        ) : (
          <>
            <div className="search-field">
              <Icon name="search" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Une tâche, une note, un mot…"
                aria-label="Rechercher dans les tâches et les notes"
              />
              {query && (
                <button
                  className="icon-button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  aria-label="Effacer la recherche"
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
            <p className="search-summary" role="status">
              {!query.trim()
                ? "Dans toutes tes tâches, tes étapes et tes notes."
                : `${total} résultat${total > 1 ? "s" : ""}`}
            </p>
            <div className="search-results">
              {query.trim() && total === 0 && (
                <div className="search-empty">
                  <Icon name="search" size={32} />
                  <h3>Aucun résultat pour « {query} »</h3>
                  <p>Essaie un autre mot du titre ou de la note.</p>
                </div>
              )}
              {results.tasks.length > 0 && (
                <>
                  <h3 className="result-group-title">
                    Tâches <span>{results.tasks.length}</span>
                  </h3>
                  <ul>
                    {results.tasks.map((task) => (
                      <li key={task.id}>
                        <button
                          className="search-result"
                          onClick={() => onSelectTask(task.id)}
                        >
                          <Icon
                            name={
                              task.completedDate
                                ? "check"
                                : task.recurrence
                                  ? "repeat"
                                  : "cards"
                            }
                          />
                          <span>
                            <strong>{task.title}</strong>
                            <small>
                              {taskStatus(task)}
                              {task.recurrence ? " · Récurrente" : ""}
                              {task.isPinned ? " · Épinglée" : ""}
                            </small>
                            {task.note && <p>{task.note}</p>}
                          </span>
                          <Icon name="arrow" size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {results.notes.length > 0 && (
                <>
                  <h3 className="result-group-title">
                    Notes <span>{results.notes.length}</span>
                  </h3>
                  <ul>
                    {results.notes.map((item) => (
                      <li key={item.id}>
                        <button
                          className="search-result"
                          onClick={() => setNoteId(item.id)}
                        >
                          <Icon name="note" />
                          <span>
                            <strong>
                              {item.fromTaskTitle ?? "Note libre"}
                            </strong>
                            <p>{item.text}</p>
                          </span>
                          <Icon name="arrow" size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
