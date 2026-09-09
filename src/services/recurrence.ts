import type { RecurrenceRule, Task } from "../types/task";
import { parseFrenchDate } from "./frenchDateParser";
import { toLocalISODate, toLocalISODateTime } from "./localDate";

function localDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(iso)) return null;
  const date = new Date(iso.length === 10 ? `${iso}T00:00` : iso);
  if (!Number.isFinite(date.getTime())) return null;
  if (
    (iso.length === 10 ? toLocalISODate(date) : toLocalISODateTime(date)) !==
    iso
  )
    return null;
  return date;
}

function scheduledDateValue(iso: string): Date | null {
  const simple = localDate(iso);
  if (simple) return simple;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(iso)) return null;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function isRecurrenceRule(value: unknown): value is RecurrenceRule {
  if (!value || typeof value !== "object") return false;
  const rule = value as RecurrenceRule;
  return (
    ["daily", "weekdays", "weekly", "monthly"].includes(rule.frequency) &&
    typeof rule.anchorDate === "string" &&
    !!localDate(rule.anchorDate) &&
    (rule.seriesId === undefined ||
      (typeof rule.seriesId === "string" && rule.seriesId.length > 0))
  );
}

export function createRecurrence(
  frequency: RecurrenceRule["frequency"],
  scheduledDate: string | null = null,
  now = new Date(),
): RecurrenceRule {
  const date = scheduledDate ? scheduledDateValue(scheduledDate) : null;
  return {
    frequency,
    anchorDate: date
      ? scheduledDate!.length === 10
        ? toLocalISODate(date)
        : toLocalISODateTime(date)
      : toLocalISODate(now),
  };
}

/** Premier créneau disponible, ou créneau suivant strictement après l'occurrence passée. */
export function nextRecurrenceDate(
  rule: RecurrenceRule,
  now = new Date(),
  after?: string | null,
): string | null {
  if (!isRecurrenceRule(rule)) return null;
  const anchor = localDate(rule.anchorDate)!;
  const timed = rule.anchorDate.length > 10;
  const previous = after ? scheduledDateValue(after) : null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lower = new Date(
    Math.max(today.getTime(), previous?.getTime() ?? 0, anchor.getTime()),
  );
  const candidate = new Date(
    lower.getFullYear(),
    lower.getMonth(),
    lower.getDate(),
  );
  const setClock = (date: Date) =>
    date.setHours(
      timed ? anchor.getHours() : 0,
      timed ? anchor.getMinutes() : 0,
      0,
      0,
    );
  const eligible = (date: Date) => {
    if (date < anchor) return false;
    if (timed ? date.getTime() <= now.getTime() : date < today) return false;
    // A completed date-only occurrence consumes its whole calendar day.
    if (
      previous &&
      (after!.length === 10
        ? toLocalISODate(date) <= toLocalISODate(previous)
        : date.getTime() <= previous.getTime())
    )
      return false;
    return date.getFullYear() <= 9999;
  };
  if (rule.frequency === "monthly") {
    candidate.setDate(1);
    // At most two normal attempts; the bound also protects malformed dates.
    for (let attempt = 0; attempt < 24; attempt++) {
      const days = new Date(
        candidate.getFullYear(),
        candidate.getMonth() + 1,
        0,
      ).getDate();
      candidate.setDate(Math.min(anchor.getDate(), days));
      setClock(candidate);
      if (eligible(candidate))
        return timed
          ? toLocalISODateTime(candidate)
          : toLocalISODate(candidate);
      candidate.setDate(1);
      candidate.setMonth(candidate.getMonth() + 1);
    }
    return null;
  }
  if (rule.frequency === "weekly")
    candidate.setDate(
      candidate.getDate() + ((anchor.getDay() - candidate.getDay() + 7) % 7),
    );
  for (let attempt = 0; attempt < 14; attempt++) {
    setClock(candidate);
    const weekday = candidate.getDay();
    if (
      (rule.frequency !== "weekdays" || (weekday !== 0 && weekday !== 6)) &&
      eligible(candidate)
    ) {
      return timed ? toLocalISODateTime(candidate) : toLocalISODate(candidate);
    }
    candidate.setDate(
      candidate.getDate() + (rule.frequency === "weekly" ? 7 : 1),
    );
  }
  return null;
}

export function recurrenceLabel(rule: RecurrenceRule): string {
  if (!isRecurrenceRule(rule)) return "Récurrente";
  const date = localDate(rule.anchorDate)!;
  switch (rule.frequency) {
    case "daily":
      return "Tous les jours";
    case "weekdays":
      return "Du lundi au vendredi";
    case "weekly":
      return `Chaque ${date.toLocaleDateString("fr-FR", { weekday: "long" })}`;
    case "monthly":
      return `Chaque mois, le ${date.getDate()}`;
  }
}

export function nextRecurringTask(
  task: Task,
  now = new Date(),
  history: Task[] = [],
): Task | null {
  if (!isRecurrenceRule(task.recurrence)) return null;
  const seriesId = task.recurrence.seriesId ?? task.id;
  // Reopening an older occurrence must not collide with another occurrence
  // already completed in advance. Those calendar slots remain consumed.
  const consumed = [
    task,
    ...history.filter(
      (item) =>
        item.completedDate &&
        (item.recurrence?.seriesId ?? item.id) === seriesId,
    ),
  ]
    .map((item) =>
      item.isCarriedOver && item.originalDate
        ? `${item.originalDate}${item.recurrence?.anchorDate.slice(10) ?? ""}`
        : (item.scheduledDate ?? item.createdDate),
    )
    .sort(
      (a, b) =>
        (scheduledDateValue(b)?.getTime() ?? 0) -
        (scheduledDateValue(a)?.getTime() ?? 0),
    )[0];
  const scheduledDate = nextRecurrenceDate(task.recurrence, now, consumed);
  if (!scheduledDate) return null;
  const id = `${seriesId}:occ:${scheduledDate}`;
  return {
    ...task,
    id,
    createdDate: toLocalISODate(now),
    scheduledDate,
    originalDate: scheduledDate.slice(0, 10),
    completedDate: null,
    isCarriedOver: false,
    isPinned: false,
    note: task.note,
    subtasks: task.subtasks?.map((step, index) => ({
      ...step,
      id: `${id}:step:${index}`,
      done: false,
    })),
    recurrence: { ...task.recurrence, seriesId },
    recurrenceNextId: undefined,
  };
}

/**
 * Cockpit peut cocher une tâche sans connaître la récurrence. On matérialise son
 * successeur ici aussi, avec le même ID sur chaque appareil. Une occurrence en
 * retard reste unique : aucun calendrier en arrière-plan ne crée de doublons.
 */
export function reconcileRecurringTasks(
  tasks: Task[],
  now = new Date(),
): Task[] {
  const series = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!isRecurrenceRule(task.recurrence)) continue;
    const id = task.recurrence.seriesId ?? task.id;
    const group = series.get(id) ?? [];
    group.push(task);
    series.set(id, group);
  }
  let result = tasks;
  for (const group of series.values()) {
    // Cockpit peut décocher l'ancienne occurrence après que son successeur a
    // déjà été créé. Le lien identifie cette réouverture : elle reprend la
    // place de l'occurrence active, comme l'annulation locale.
    const reopened = group
      .filter((task) => !task.completedDate && task.recurrenceNextId)
      .sort((a, b) =>
        (a.scheduledDate ?? a.createdDate).localeCompare(
          b.scheduledDate ?? b.createdDate,
        ),
      )[0];
    if (reopened) {
      const superseded = new Set(
        group
          .filter((task) => !task.completedDate && task.id !== reopened.id)
          .map((task) => task.id),
      );
      result = result
        .filter((task) => !superseded.has(task.id))
        .map((task) =>
          task.id === reopened.id
            ? { ...task, recurrenceNextId: undefined }
            : task,
        );
      continue;
    }
    const completed = group
      .filter((task) => task.completedDate)
      .sort(
        (a, b) =>
          (b.completedDate ?? "").localeCompare(a.completedDate ?? "") ||
          (b.scheduledDate ?? b.createdDate).localeCompare(
            a.scheduledDate ?? a.createdDate,
          ),
      );
    const latest = completed[0];
    if (!latest) continue;
    const active = group.find((task) => !task.completedDate);
    const next =
      !active && !latest.recurrenceNextId
        ? nextRecurringTask(latest, now, group)
        : null;
    const nextId = active?.id ?? latest.recurrenceNextId ?? next?.id;
    if (!nextId) continue;
    const completedIds = new Set(
      completed.filter((task) => !task.recurrenceNextId).map((task) => task.id),
    );
    if (completedIds.size)
      result = result.map((task) =>
        completedIds.has(task.id)
          ? { ...task, recurrenceNextId: nextId }
          : task,
      );
    if (next && !result.some((task) => task.id === next.id))
      result = [...result, next];
  }
  return result;
}

export interface ParsedRecurringTask {
  title: string;
  recurrence: RecurrenceRule | null;
  scheduledDate: string | null;
}

/** Supprime uniquement les formulations explicites de répétition. */
export function parseRecurringTask(
  text: string,
  now = new Date(),
): ParsedRecurringTask {
  const weekdays = [
    "dimanche",
    "lundi",
    "mardi",
    "mercredi",
    "jeudi",
    "vendredi",
    "samedi",
  ];
  const patterns: {
    expression: RegExp;
    frequency: RecurrenceRule["frequency"];
    weekday?: boolean;
  }[] = [
    {
      expression:
        /\b(?:chaque|tous les)\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)s?\b/i,
      frequency: "weekly",
      weekday: true,
    },
    {
      expression:
        /\b(?:du lundi au vendredi|(?:chaque|tous les)\s+jours?\s+ouvr[ée]s)\b/i,
      frequency: "weekdays",
    },
    {
      expression: /\b(?:chaque jour|tous les jours|quotidiennement)\b/i,
      frequency: "daily",
    },
    {
      expression:
        /\b(?:chaque semaine|toutes les semaines|hebdomadairement)\b/i,
      frequency: "weekly",
    },
    {
      expression: /\b(?:chaque mois|tous les mois|mensuellement)\b/i,
      frequency: "monthly",
    },
  ];
  for (const pattern of patterns) {
    const match = pattern.expression.exec(text);
    if (!match) continue;
    const stripped =
      `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`
        .replace(/\s+/g, " ")
        .trim();
    const parsed = parseFrenchDate(stripped, now);
    const date = new Date(parsed.detectedDate ?? now);
    if (!parsed.hasTime) date.setHours(0, 0, 0, 0);
    if (pattern.weekday) {
      date.setDate(
        date.getDate() +
          ((weekdays.indexOf(match[1].toLowerCase()) - date.getDay() + 7) % 7),
      );
    }
    const recurrence = createRecurrence(
      pattern.frequency,
      parsed.hasTime ? toLocalISODateTime(date) : toLocalISODate(date),
      now,
    );
    return {
      title: parsed.cleanTitle,
      recurrence,
      scheduledDate: nextRecurrenceDate(recurrence, now),
    };
  }
  return { title: text, recurrence: null, scheduledDate: null };
}
