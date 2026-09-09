export interface SubTask {
  id: string;
  title: string;
  done: boolean;
}

/** Calendrier local fixe : reporter une occurrence ne déplace pas la série. */
export interface RecurrenceRule {
  frequency: "daily" | "weekdays" | "weekly" | "monthly";
  /** Première date choisie, avec son heure éventuelle et son jour du mois. */
  anchorDate: string;
  /** Attribué à la création ; commun à toutes les occurrences. */
  seriesId?: string;
}

export interface Task {
  id: string;
  title: string;
  /** ISO date (YYYY-MM-DD) à laquelle la tâche a été créée. */
  createdDate: string;
  /** ISO datetime ou date YYYY-MM-DD si planifiée. null = pour aujourd'hui. */
  scheduledDate: string | null;
  /** ISO datetime de complétion. null = pas encore faite. */
  completedDate: string | null;
  /** True si la tâche a été reportée automatiquement d'un jour précédent. */
  isCarriedOver: boolean;
  /** ISO date YYYY-MM-DD originale (avant report). */
  originalDate: string;
  /** Note libre écrite pendant qu'on travaille sur la tâche. */
  note?: string;
  /** Étapes de la tâche. Absent tant qu'on n'en a pas ajouté. */
  subtasks?: SubTask[];
  /**
   * Tâche gardée en tête du paquet.
   *
   * Le drapeau était rangé dans les réglages, sous `pinnedTaskId`. Or la
   * synchronisation n'échange que les tâches et les notes : l'étoile posée sur
   * le téléphone ne parvenait jamais à l'ordinateur. Elle décrit la tâche, pas
   * l'appareil — sa place est ici, où elle voyage avec le reste.
   */
  isPinned?: boolean;
  /** Absent pour les tâches ordinaires et les sauvegardes antérieures. */
  recurrence?: RecurrenceRule;
  /** Successeur déjà créé. Empêche de recréer une occurrence supprimée. */
  recurrenceNextId?: string;
}

/**
 * Note conservée dans la page Notes. Une note peut être autonome, ou provenir
 * d'une tâche terminée dont on a choisi de garder le contenu.
 */
export interface Note {
  id: string;
  text: string;
  createdAt: string;
  /** Titre de la tâche d'origine, figé : la tâche peut disparaître ensuite. */
  fromTaskTitle?: string;
}

export type TabKey = "today" | "later" | "cards" | "notes";

export interface Settings {
  notificationsEnabled: boolean;
  morningSummaryTime: string; // "HH:mm"
  themeMode: "system" | "light" | "dark";
  /** Tâche à afficher en premier dans l'onglet Cartes. */
  pinnedTaskId: string | null;
}
