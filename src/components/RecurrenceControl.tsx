import { createRecurrence, recurrenceLabel } from "../services/recurrence";
import type { RecurrenceRule } from "../types/task";

interface Props {
  value?: RecurrenceRule | null;
  scheduledDate: string | null;
  onChange: (rule: RecurrenceRule | null) => void;
  disabled?: boolean;
}

export function RecurrenceControl({
  value,
  scheduledDate,
  onChange,
  disabled = false,
}: Props) {
  const anchor = value?.anchorDate ?? scheduledDate;
  const weekly = createRecurrence("weekly", anchor);
  const monthly = createRecurrence("monthly", anchor);
  return (
    <label className="recurrence-control">
      <span className="recurrence-control-label">
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3" />
        </svg>
        Répéter
      </span>
      <select
        aria-label="Répétition de la tâche"
        value={value?.frequency ?? "none"}
        disabled={disabled}
        onChange={(event) => {
          const frequency = event.target.value;
          onChange(
            frequency === "none"
              ? null
              : createRecurrence(
                  frequency as RecurrenceRule["frequency"],
                  anchor,
                ),
          );
        }}
      >
        <option value="none">Ne pas répéter</option>
        <option value="daily">Tous les jours</option>
        <option value="weekdays">Du lundi au vendredi</option>
        <option value="weekly">{recurrenceLabel(weekly)}</option>
        <option value="monthly">{recurrenceLabel(monthly)}</option>
      </select>
    </label>
  );
}
