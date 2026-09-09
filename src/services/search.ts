import type { Note, Task } from "../types/task";

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .trim();

/** Accent-insensitive, local search. Every word may match title, note or steps. */
export function searchItems(tasks: Task[], notes: Note[], query: string) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return { tasks: [], notes: [] };
  const matches = (value: string) =>
    words.every((word) => normalize(value).includes(word));
  return {
    tasks: tasks
      .filter((task) =>
        matches(
          [
            task.title,
            task.note,
            ...(task.subtasks ?? []).map((step) => step.title),
          ].join(" "),
        ),
      )
      .sort((a, b) => Number(!!a.completedDate) - Number(!!b.completedDate)),
    notes: notes.filter((note) =>
      matches(`${note.fromTaskTitle ?? ""} ${note.text}`),
    ),
  };
}
