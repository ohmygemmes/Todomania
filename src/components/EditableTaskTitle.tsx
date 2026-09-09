import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

interface Props {
  title: string;
  onSave: (title: string) => void;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  variant: "row" | "card";
  className?: string;
}

/** A tap edits the title; the surrounding card can still recognize a real drag. */
export function EditableTaskTitle({
  title,
  onSave,
  editing,
  onEditingChange,
  variant,
  className = "",
}: Props) {
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const finishedEdit = useRef(false);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const start = () => {
    setDraft(title);
    finishedEdit.current = false;
    onEditingChange(true);
  };

  const finish = (save: boolean) => {
    // Enter can also cause blur when the input unmounts: save only once.
    if (finishedEdit.current) return;
    finishedEdit.current = true;
    const next = draft.trim();
    if (save && next && next !== title) onSave(next);
    onEditingChange(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        data-swipe-title
        onClick={start}
        aria-label={`Modifier le titre : ${title}`}
        title="Modifier le titre"
        className={`editable-task-title editable-task-title-${variant} ${className}`}
      >
        <span className="editable-title-text">{title || "Tâche"}</span>
        <span className="title-edit-indicator" aria-hidden="true">
          <Icon name="edit" size={14} />
        </span>
      </button>
    );
  }

  const fieldProps = {
    value: draft,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setDraft(event.target.value),
    onKeyDown: (
      event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      }
    },
    "aria-label": "Titre de la tâche",
    enterKeyHint: "done" as const,
    autoComplete: "off",
    className: `task-title-input task-title-input-${variant}`,
  };

  return (
    <div
      data-swipe-ignore
      className={`task-title-editor task-title-editor-${variant}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          finish(true);
      }}
    >
      {variant === "card" ? (
        <textarea
          {...fieldProps}
          rows={3}
          ref={(element) => {
            inputRef.current = element;
          }}
        />
      ) : (
        <input
          {...fieldProps}
          ref={(element) => {
            inputRef.current = element;
          }}
        />
      )}
      <div className="task-title-edit-actions">
        <button
          type="button"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => finish(false)}
          aria-label="Annuler la modification"
          title="Annuler"
        >
          <Icon name="close" size={16} />
        </button>
        <button
          type="button"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => finish(true)}
          aria-label="Enregistrer le titre"
          title="Enregistrer"
          className="save-title"
        >
          <Icon name="check" size={16} />
        </button>
      </div>
    </div>
  );
}
