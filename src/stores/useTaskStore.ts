import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Note,
  RecurrenceRule,
  Settings,
  SubTask,
  Task,
} from "../types/task";
import { toLocalISODate, toLocalISODateTime } from "../services/localDate";
import {
  isRecurrenceRule,
  nextRecurrenceDate,
  nextRecurringTask,
  reconcileRecurringTasks,
} from "../services/recurrence";

const TASKS_KEY = "idayal:tasks:v1";
const SETTINGS_KEY = "idayal:settings:v1";
const NOTES_KEY = "idayal:notes:v1";

const DEFAULT_SETTINGS: Settings = {
  notificationsEnabled: false,
  morningSummaryTime: "08:00",
  themeMode: "system",
  pinnedTaskId: null,
};

function todayISO(): string {
  return toLocalISODate(new Date());
}

function isPastDate(iso: string): boolean {
  const date = iso.length === 10 ? new Date(iso + "T00:00:00") : new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return date.getTime() < start.getTime();
}

function isTodayOrPast(iso: string): boolean {
  const date = iso.length === 10 ? new Date(iso + "T00:00:00") : new Date(iso);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return date.getTime() <= end.getTime();
}

function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return reconcileRecurringTasks(parsed as Task[]);
  } catch {
    return [];
  }
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Note[]) : [];
  } catch {
    return [];
  }
}

function saveTasks(tasks: Task[]) {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

function saveNotes(notes: Note[]) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}

function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Reporte les tâches non complétées des jours passés vers aujourd'hui. */
function carryOverPastTasks(tasks: Task[]): {
  tasks: Task[];
  changed: boolean;
} {
  const today = todayISO();
  let changed = false;
  const reconciled = reconcileRecurringTasks(tasks);
  if (reconciled !== tasks) changed = true;
  const next = reconciled.map((t) => {
    if (t.completedDate) return t;
    const ref = t.scheduledDate ?? t.createdDate;
    if (isPastDate(ref)) {
      changed = true;
      return {
        ...t,
        isCarriedOver: true,
        originalDate:
          t.originalDate ||
          (t.scheduledDate ? t.scheduledDate.slice(0, 10) : t.createdDate),
        scheduledDate: today,
      };
    }
    return t;
  });
  return { tasks: next, changed };
}

/** Action annulable proposée à l'utilisateur juste après coup. */
export interface UndoState {
  /** Change à chaque nouvelle action : sert à relancer l'affichage côté UI. */
  id: number;
  label: string;
}

export interface TaskStore {
  tasks: Task[];
  notes: Note[];
  settings: Settings;
  todayTasks: Task[];
  laterTasks: Task[];
  /** Renvoie l'identifiant créé, ou `null` si le titre était vide. */
  addTask: (
    title: string,
    scheduledDate?: string | null,
    recurrence?: RecurrenceRule | null,
  ) => string | null;
  setTaskRecurrence: (id: string, recurrence: RecurrenceRule | null) => void;
  toggleComplete: (id: string) => void;
  /** Termine une tâche en décidant du sort de sa note. */
  completeTask: (id: string, keepNote: boolean) => void;
  deleteTask: (id: string) => void;
  updateTaskTitle: (id: string, title: string) => void;
  setTaskNote: (id: string, note: string) => void;
  addSubtask: (taskId: string, title: string) => void;
  toggleSubtask: (taskId: string, subId: string) => void;
  deleteSubtask: (taskId: string, subId: string) => void;
  /** Supprime toutes les tâches déjà faites. Renvoie le nombre supprimé. */
  clearCompleted: () => number;
  /** Remplace intégralement l'état local (utilisé par la synchronisation). */
  replaceAll: (tasks: Task[], notes: Note[]) => void;
  addNote: (text: string) => void;
  updateNote: (id: string, text: string) => void;
  deleteNote: (id: string) => void;
  postponeToTomorrow: (id: string) => void;
  bringToToday: (id: string) => void;
  /** Pose une échéance quelconque. `null` retire la date. */
  rescheduleTask: (id: string, scheduledDate: string | null) => void;
  pinTask: (id: string | null) => void;
  /** Déplace `id` juste après `afterId` dans l'ordre de la pile (null = tout devant). */
  placeAfterTask: (id: string, afterId: string | null) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  cleanOldCompleted: (days?: number) => number;
  exportJSON: () => string;
  importJSON: (json: string) => boolean;
  undoState: UndoState | null;
  undo: () => void;
  clearUndo: () => void;
}

export function useTaskStore(): TaskStore {
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks());
  const [notes, setNotes] = useState<Note[]>(() => loadNotes());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [undoState, setUndoState] = useState<UndoState | null>(null);

  /**
   * L'annulation est stockée comme une fonction pure appliquée aux tâches
   * *courantes*, et non comme une copie figée : si l'utilisateur ajoute une
   * tâche entre-temps, annuler ne l'efface pas.
   */
  const restoreRef = useRef<((cur: Task[]) => Task[]) | null>(null);
  const restoreNotesRef = useRef<((cur: Note[]) => Note[]) | null>(null);
  const undoSeq = useRef(0);

  const registerUndo = useCallback(
    (
      label: string,
      restore: (cur: Task[]) => Task[],
      restoreNotes?: (cur: Note[]) => Note[],
    ) => {
      restoreRef.current = restore;
      restoreNotesRef.current = restoreNotes ?? null;
      undoSeq.current += 1;
      setUndoState({ id: undoSeq.current, label });
    },
    [],
  );

  const undo = useCallback(() => {
    const restore = restoreRef.current;
    if (!restore) return;
    setTasks(restore);
    if (restoreNotesRef.current) setNotes(restoreNotesRef.current);
    restoreNotesRef.current = null;
    restoreRef.current = null;
    setUndoState(null);
  }, []);

  const clearUndo = useCallback(() => {
    restoreRef.current = null;
    restoreNotesRef.current = null;
    setUndoState(null);
  }, []);

  /*
   * Reprise de l'ancien emplacement de l'étoile.
   *
   * Elle vivait dans les réglages, qui ne sont pas synchronisés : elle restait
   * sur l'appareil où on l'avait posée. On la reporte une fois sur la tâche,
   * puis on vide le réglage — les installations déjà à jour ne repassent pas ici.
   */
  useEffect(() => {
    const ancien = settings.pinnedTaskId;
    if (!ancien) return;
    setTasks((prev) =>
      prev.some((t) => t.id === ancien)
        ? prev.map((t) => (t.id === ancien ? { ...t, isPinned: true } : t))
        : prev,
    );
    setSettings((prev) => ({ ...prev, pinnedTaskId: null }));
  }, [settings.pinnedTaskId]);

  // Carry over au montage et à chaque retour de focus.
  useEffect(() => {
    const run = () => {
      setTasks((prev) => {
        const { tasks: next, changed } = carryOverPastTasks(prev);
        return changed ? next : prev;
      });
    };
    run();
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", run);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", run);
    };
  }, []);

  // Persistence à chaque modif.
  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);
  useEffect(() => {
    saveNotes(notes);
  }, [notes]);
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const addTask = useCallback(
    (
      title: string,
      scheduledDate: string | null = null,
      recurrence?: RecurrenceRule | null,
    ) => {
      const trimmed = title.trim();
      if (!trimmed) return null;
      const today = todayISO();
      const id = newId();
      const rule = isRecurrenceRule(recurrence)
        ? { ...recurrence, seriesId: id }
        : undefined;
      const task: Task = {
        id,
        title: trimmed,
        createdDate: today,
        scheduledDate:
          scheduledDate ?? (rule ? nextRecurrenceDate(rule) : null),
        recurrence: rule,
        completedDate: null,
        isCarriedOver: false,
        originalDate: rule
          ? (scheduledDate ?? rule.anchorDate).slice(0, 10)
          : today,
      };
      setTasks((prev) => [task, ...prev]);
      return task.id;
    },
    [],
  );

  /** One action creates one successor and one optional note, outside replayable updaters. */
  const completeTask = useCallback(
    (id: string, keepNote: boolean) => {
      const target = tasks.find((t) => t.id === id);
      if (!target || target.completedDate) return;
      const now = new Date();
      const successor = nextRecurringTask(target, now, tasks);
      const seriesId = target.recurrence?.seriesId ?? target.id;
      const existingSuccessor =
        target.recurrence &&
        tasks.find(
          (t) =>
            t.id !== id &&
            !t.completedDate &&
            t.recurrence?.seriesId === seriesId,
        );
      const next = existingSuccessor ?? successor;
      const note = (target.note ?? "").trim();
      const kept: Note | null =
        keepNote && note
          ? {
              id: newId(),
              text: note,
              createdAt: now.toISOString(),
              fromTaskTitle: target.title,
            }
          : null;
      if (kept) setNotes((cur) => [kept, ...cur]);
      registerUndo(
        "Tâche terminée",
        (cur) =>
          cur
            .filter(
              (t) => !successor || existingSuccessor || t.id !== successor.id,
            )
            .map((t) =>
              t.id === id
                ? {
                    ...t,
                    completedDate: null,
                    note: target.note,
                    recurrenceNextId: target.recurrenceNextId,
                  }
                : t,
            ),
        kept ? (cur) => cur.filter((n) => n.id !== kept.id) : undefined,
      );
      const completedDate = toLocalISODateTime(now);
      setTasks((prev) => {
        if (prev.find((t) => t.id === id)?.completedDate) return prev;
        const updated = prev.map((t) =>
          t.id === id
            ? {
                ...t,
                completedDate,
                note: keepNote ? t.note : "",
                recurrenceNextId: next?.id,
              }
            : t,
        );
        return successor &&
          !existingSuccessor &&
          !updated.some((t) => t.id === successor.id)
          ? [...updated, successor]
          : updated;
      });
    },
    [tasks, registerUndo],
  );

  const toggleComplete = useCallback(
    (id: string) => {
      const target = tasks.find((t) => t.id === id);
      if (!target) return;
      if (!target.completedDate) {
        completeTask(id, false);
        return;
      }
      const seriesId = target.recurrence?.seriesId ?? target.id;
      setTasks((prev) =>
        prev
          .filter(
            (t) =>
              !(
                target.recurrence &&
                t.id !== id &&
                !t.completedDate &&
                (t.recurrence?.seriesId ?? t.id) === seriesId
              ),
          )
          .map((t) =>
            t.id === id
              ? { ...t, completedDate: null, recurrenceNextId: undefined }
              : t,
          ),
      );
      clearUndo();
    },
    [tasks, completeTask, clearUndo],
  );

  const setTaskRecurrence = useCallback(
    (id: string, recurrence: RecurrenceRule | null) => {
      setTasks((prev) => {
        const target = prev.find((t) => t.id === id);
        if (!target || target.completedDate) return prev;
        const seriesId = target.recurrence?.seriesId ?? id;
        const rule = isRecurrenceRule(recurrence)
          ? { ...recurrence, seriesId }
          : undefined;
        return prev.map((t) => {
          if (t.id === id)
            return {
              ...t,
              recurrence: rule,
              recurrenceNextId: undefined,
              scheduledDate: rule
                ? (nextRecurrenceDate(rule) ?? t.scheduledDate)
                : t.scheduledDate,
              isCarriedOver: rule ? false : t.isCarriedOver,
            };
          // A removed rule stays removed even if an older Cockpit completion had no successor marker.
          return !rule &&
            t.completedDate &&
            (t.recurrence?.seriesId ?? t.id) === seriesId
            ? { ...t, recurrenceNextId: t.recurrenceNextId ?? id }
            : t;
        });
      });
    },
    [],
  );

  const deleteTask = useCallback(
    (id: string) => {
      setTasks((prev) => {
        const index = prev.findIndex((t) => t.id === id);
        if (index === -1) return prev;
        const removed = prev[index];
        registerUndo("Tâche supprimée", (cur) => {
          if (cur.some((t) => t.id === id)) return cur; // déjà restaurée
          const at = Math.min(index, cur.length);
          return [...cur.slice(0, at), removed, ...cur.slice(at)];
        });
        return prev.filter((t) => t.id !== id);
      });
    },
    [registerUndo],
  );

  const updateTaskTitle = useCallback((id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title: trimmed } : t)),
    );
  }, []);

  const setTaskNote = useCallback((id: string, note: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, note } : t)));
  }, []);

  const addSubtask = useCallback((taskId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const sub: SubTask = { id: newId(), title: trimmed, done: false };
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, subtasks: [...(t.subtasks ?? []), sub] } : t,
      ),
    );
  }, []);

  const toggleSubtask = useCallback((taskId: string, subId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              subtasks: (t.subtasks ?? []).map((s) =>
                s.id === subId ? { ...s, done: !s.done } : s,
              ),
            }
          : t,
      ),
    );
  }, []);

  const deleteSubtask = useCallback((taskId: string, subId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, subtasks: (t.subtasks ?? []).filter((s) => s.id !== subId) }
          : t,
      ),
    );
  }, []);

  const clearCompleted = useCallback(() => {
    let removed = 0;
    setTasks((prev) => {
      const done = prev.filter((t) => !!t.completedDate);
      removed = done.length;
      if (!removed) return prev;
      registerUndo(
        `${removed} tâche${removed > 1 ? "s" : ""} effacée${removed > 1 ? "s" : ""}`,
        (cur) => {
          const missing = done.filter((d) => !cur.some((t) => t.id === d.id));
          return missing.length ? [...cur, ...missing] : cur;
        },
      );
      return prev.filter((t) => !t.completedDate);
    });
    return removed;
  }, [registerUndo]);

  const replaceAll = useCallback(
    (nextTasks: Task[], nextNotes: Note[]) => {
      setTasks(
        Array.isArray(nextTasks) ? carryOverPastTasks(nextTasks).tasks : [],
      );
      setNotes(Array.isArray(nextNotes) ? nextNotes : []);
      clearUndo();
    },
    [clearUndo],
  );

  const addNote = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setNotes((prev) => [
      { id: newId(), text: trimmed, createdAt: new Date().toISOString() },
      ...prev,
    ]);
  }, []);

  const updateNote = useCallback((id: string, text: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, text } : n)));
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const postponeToTomorrow = useCallback(
    (id: string) => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const iso = toLocalISODate(tomorrow);
      setTasks((prev) => {
        const target = prev.find((t) => t.id === id);
        if (!target) return prev;
        const prevScheduled = target.scheduledDate;
        const prevCarried = target.isCarriedOver;
        registerUndo("Reportée à demain", (cur) =>
          cur.map((t) =>
            t.id === id
              ? {
                  ...t,
                  scheduledDate: prevScheduled,
                  isCarriedOver: prevCarried,
                }
              : t,
          ),
        );
        return prev.map((t) =>
          t.id === id ? { ...t, scheduledDate: iso, isCarriedOver: false } : t,
        );
      });
    },
    [registerUndo],
  );

  /**
   * Repose une tâche à une date choisie.
   *
   * `postponeToTomorrow` ne sait faire qu'un pas en avant, et `bringToToday`
   * qu'un pas en arrière. Modifier l'heure d'un rappel ou choisir « dans trois
   * jours » demandait une troisième fonction plutôt qu'un empilement des deux.
   *
   * Le report automatique est levé : une date posée à la main est un choix, pas
   * un retard hérité de la veille.
   */
  const rescheduleTask = useCallback(
    (id: string, scheduledDate: string | null) => {
      setTasks((prev) => {
        const target = prev.find((t) => t.id === id);
        if (!target) return prev;
        const prevScheduled = target.scheduledDate;
        const prevCarried = target.isCarriedOver;
        registerUndo("Échéance modifiée", (cur) =>
          cur.map((t) =>
            t.id === id
              ? {
                  ...t,
                  scheduledDate: prevScheduled,
                  isCarriedOver: prevCarried,
                }
              : t,
          ),
        );
        return prev.map((t) =>
          t.id === id ? { ...t, scheduledDate, isCarriedOver: false } : t,
        );
      });
    },
    [registerUndo],
  );

  const bringToToday = useCallback((id: string) => {
    const today = todayISO();
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, scheduledDate: today, isCarriedOver: false } : t,
      ),
    );
  }, []);

  /**
   * Une seule tâche porte l'étoile à la fois : l'écran Cartes n'en montre qu'une,
   * et deux « celle-ci d'abord » ne veulent rien dire.
   */
  const pinTask = useCallback((id: string | null) => {
    setTasks((prev) => {
      const cible = id ? prev.find((t) => t.id === id) : null;
      const allume = !!cible && !cible.isPinned;
      return prev.map((t) =>
        t.isPinned || t.id === id
          ? { ...t, isPinned: allume && t.id === id }
          : t,
      );
    });
  }, []);

  const placeAfterTask = useCallback((id: string, afterId: string | null) => {
    setTasks((prev) => {
      const moving = prev.find((t) => t.id === id);
      if (!moving) return prev;
      const rest = prev.filter((t) => t.id !== id);
      if (!afterId) return [moving, ...rest];
      const idx = rest.findIndex((t) => t.id === afterId);
      if (idx === -1) return [moving, ...rest];
      return [...rest.slice(0, idx + 1), moving, ...rest.slice(idx + 1)];
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const cleanOldCompleted = useCallback((days = 30) => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    let removed = 0;
    setTasks((prev) =>
      prev.filter((t) => {
        if (!t.completedDate) return true;
        const ok = new Date(t.completedDate).getTime() >= cutoff;
        if (!ok) removed += 1;
        return ok;
      }),
    );
    return removed;
  }, []);

  const exportJSON = useCallback(() => {
    return JSON.stringify(
      { tasks, notes, settings, exportedAt: new Date().toISOString() },
      null,
      2,
    );
  }, [tasks, notes, settings]);

  const importJSON = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed?.tasks)) {
        setTasks(carryOverPastTasks(parsed.tasks as Task[]).tasks);
        if (Array.isArray(parsed.notes)) setNotes(parsed.notes as Note[]);
        if (parsed.settings)
          setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
        return true;
      }
      if (Array.isArray(parsed)) {
        setTasks(carryOverPastTasks(parsed as Task[]).tasks);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const todayTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.completedDate) {
        const cd = t.completedDate.slice(0, 10);
        return cd === todayISO();
      }
      const ref = t.scheduledDate ?? t.createdDate;
      return isTodayOrPast(ref);
    });
  }, [tasks]);

  const laterTasks = useMemo(() => {
    const today = todayISO();
    return tasks.filter((t) => {
      if (t.completedDate) return false;
      if (!t.scheduledDate) return false;
      return t.scheduledDate.slice(0, 10) > today;
    });
  }, [tasks]);

  return {
    tasks,
    notes,
    settings,
    todayTasks,
    laterTasks,
    addTask,
    setTaskRecurrence,
    toggleComplete,
    completeTask,
    deleteTask,
    updateTaskTitle,
    setTaskNote,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
    clearCompleted,
    replaceAll,
    addNote,
    updateNote,
    deleteNote,
    postponeToTomorrow,
    bringToToday,
    rescheduleTask,
    pinTask,
    placeAfterTask,
    updateSettings,
    cleanOldCompleted,
    exportJSON,
    importJSON,
    undoState,
    undo,
    clearUndo,
  };
}
