import { useEffect, useMemo, useRef, useState } from "react";
import { BrandHeader } from "./components/BrandHeader";
import { CardsView } from "./components/CardsView";
import {
  CompleteTaskDialog,
  type CompleteStep,
} from "./components/CompleteTaskDialog";
import { DueTaskBanner } from "./components/DueTaskBanner";
import { LaterView } from "./components/LaterView";
import { NotesView } from "./components/NotesView";
import { QuickAddBar } from "./components/QuickAddBar";
import { SettingsModal } from "./components/SettingsModal";
import { TabBar } from "./components/TabBar";
import { TodayView } from "./components/TodayView";
import { SearchSheet } from "./components/SearchSheet";
import { TaskPreviewSheet } from "./components/TaskPreviewSheet";
import { parseRecurringTask } from "./services/recurrence";
import { parseFrenchDate } from "./services/frenchDateParser";
import { scheduleNotifications } from "./services/notificationService";
import { orderDeck } from "./services/stack";
import { useCloudSync } from "./hooks/useCloudSync";
import { useTaskStore } from "./stores/useTaskStore";
import { toLocalISODate, toLocalISODateTime } from "./services/localDate";
import type { RecurrenceRule, TabKey } from "./types/task";

/** Injectée depuis `package.json` par Vite : voir `vite.config.ts`. */
const APP_VERSION = __APP_VERSION__;
const SNOOZE_MS = 10 * 60 * 1000;
const FOREVER = Number.MAX_SAFE_INTEGER;

function applyTheme(mode: "system" | "light" | "dark") {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = mode === "dark" || (mode === "system" && prefersDark);
  root.classList.toggle("dark", dark);
}

/**
 * Convertit une date détectée en chaîne stockable.
 *
 * `hasTime` vient du parseur, qui sait si le texte portait une heure. Le
 * déduire de la valeur revenait à confondre « minuit pile » avec « pas
 * d'heure », et « demain 0h » perdait la sienne — donc son rappel.
 */
function toStored(d: Date, hasTime: boolean): string {
  return hasTime ? toLocalISODateTime(d) : toLocalISODate(d);
}

export default function App() {
  const store = useTaskStore();
  const sync = useCloudSync({
    tasks: store.tasks,
    notes: store.notes,
    replaceAll: store.replaceAll,
  });
  const [tab, setTab] = useState<TabKey>("today");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);
  /*
   * Ordre du paquet de cartes, propre à la session.
   *
   * Il vit ici et non dans `CardsView` : changer d'onglet démonte la vue, et
   * l'arbitrage déjà fait repartait à zéro — les tâches qu'on venait d'écarter
   * revenaient sur le dessus. Rien de tout cela n'a à être enregistré : demain,
   * la journée se réordonne d'elle-même.
   */
  const [deckFront, setDeckFront] = useState<string | null>(null);
  const [deckBack, setDeckBack] = useState<string[]>([]);
  const [transitioning, setTransitioning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dismissedUntil, setDismissedUntil] = useState<Record<string, number>>(
    {},
  );
  const [now, setNow] = useState(() => Date.now());
  /** Tâche interrompue par un « Faire maintenant », à reprendre une fois l'urgence traitée. */
  const [resumeTaskId, setResumeTaskId] = useState<string | null>(null);
  /** Complétion en attente d'une confirmation (étapes restantes, sort de la note). */
  const [pendingComplete, setPendingComplete] = useState<{
    id: string;
    step: CompleteStep;
  } | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  // Application du thème + écoute des changements système.
  useEffect(() => {
    applyTheme(store.settings.themeMode);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (store.settings.themeMode === "system") applyTheme("system");
    };
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [store.settings.themeMode]);

  // Programme les notifications quand les tâches ou les réglages changent.
  useEffect(() => {
    scheduleNotifications({
      enabled: store.settings.notificationsEnabled,
      morningTime: store.settings.morningSummaryTime,
      tasks: store.tasks,
    });
  }, [
    store.tasks,
    store.settings.notificationsEnabled,
    store.settings.morningSummaryTime,
  ]);

  // Horloge basse fréquence pour déclencher le bandeau d'échéance.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Capture externe : ?add=... (raccourci Siri, bouton Action, favori…)
  const { addTask } = store;
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("add");
    if (!raw) return;
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    lines.forEach((line) => {
      const recurring = parseRecurringTask(line);
      if (recurring.recurrence) {
        addTask(recurring.title, recurring.scheduledDate, recurring.recurrence);
        return;
      }
      const { cleanTitle, detectedDate, hasTime } = parseFrenchDate(line);
      addTask(
        cleanTitle || line,
        detectedDate ? toStored(detectedDate, hasTime) : null,
      );
    });
    // On nettoie l'URL pour ne pas re-créer la tâche au rechargement.
    const url = new URL(window.location.href);
    url.searchParams.delete("add");
    window.history.replaceState({}, "", url.toString());
    if (lines.length) {
      setToast(
        lines.length > 1 ? `${lines.length} tâches ajoutées` : "Tâche ajoutée",
      );
    }
  }, [addTask]);

  // Toast auto-dismiss.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  // La proposition d'annulation s'efface d'elle-même au bout de cinq secondes.
  const { clearUndo } = store;
  const undoId = store.undoState?.id;
  useEffect(() => {
    if (!undoId) return;
    const id = window.setTimeout(clearUndo, 5000);
    return () => window.clearTimeout(id);
  }, [undoId, clearUndo]);

  /*
   * La tâche réellement sous les yeux.
   *
   * `App` recalculait un ordre à lui, ignorant celui de la vue Cartes : il
   * croyait donc regarder une carte pendant qu'une autre était affichée.
   */
  const stack = useMemo(
    () => orderDeck(store.todayTasks, deckFront, deckBack),
    [store.todayTasks, deckFront, deckBack],
  );
  const currentTop = stack[0] ?? null;

  /**
   * Quand la tâche en cours sort de la pile (terminée, reportée, supprimée),
   * on revient sur celle qu'elle avait interrompue au lieu de retomber
   * sur une tâche au hasard.
   */
  const { todayTasks, pinTask } = store;
  /** L'étoile est portée par la tâche, donc lue depuis elle. */
  const pinnedTaskId = useMemo(
    () => store.tasks.find((t) => t.isPinned)?.id ?? null,
    [store.tasks],
  );
  useEffect(() => {
    if (!pinnedTaskId) return;
    const stillActive = todayTasks.some(
      (t) => t.id === pinnedTaskId && !t.completedDate,
    );
    if (stillActive) return;
    const resume = resumeTaskId
      ? todayTasks.find((t) => t.id === resumeTaskId && !t.completedDate)
      : null;
    pinTask(resume ? resume.id : null);
    setResumeTaskId(null);
    if (resume) setToast(`Retour à : ${resume.title}`);
  }, [todayTasks, pinnedTaskId, resumeTaskId, pinTask]);

  // Tâche dont l'heure est arrivée et qui n'est pas déjà celle en cours.
  const dueTask = useMemo(() => {
    const due = store.tasks.filter((t) => {
      if (t.completedDate) return false;
      if (!t.scheduledDate || t.scheduledDate.length <= 10) return false;
      if (new Date(t.scheduledDate).getTime() > now) return false;
      if (currentTop && t.id === currentTop.id) return false;
      const until = dismissedUntil[t.id];
      if (until && until > now) return false;
      return true;
    });
    due.sort((a, b) =>
      (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? ""),
    );
    return due[0] ?? null;
  }, [store.tasks, now, dismissedUntil, currentTop]);

  // Raccourcis clavier (ordinateur).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return;
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);
      if (typing) {
        if (e.key === "Escape") (el as HTMLInputElement).blur();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.key === "/" || e.key === "n") {
        e.preventDefault();
        addInputRef.current?.focus();
      } else if (e.key === "1") setTab("today");
      else if (e.key === "2") setTab("cards");
      else if (e.key === "3") setTab("later");
      else if (e.key === "4") setTab("notes");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Transition fade entre onglets.
  const handleTab = (next: TabKey) => {
    if (next === tab) return;
    setTransitioning(true);
    window.setTimeout(() => {
      setTab(next);
      setTransitioning(false);
    }, 120);
  };

  const handleAdd = (
    title: string,
    scheduledDate: string | null,
    recurrence?: RecurrenceRule | null,
  ) => {
    const id = store.addTask(title, scheduledDate, recurrence ?? undefined);
    if (!id) return;
    /*
     * Ce qu'on vient d'écrire s'affiche, sauf si la carte en cours est étoilée.
     *
     * L'étoile était remontée en tête quoi qu'il arrive : on notait une tâche
     * en regardant une carte quelconque, et c'est une troisième, étoilée un
     * jour et oubliée depuis, qui surgissait à la place.
     *
     * Elle ne garde donc le dessus que si c'est elle qu'on regardait — là, le
     * geste est délibéré et récent.
     */
    const shownIsStarred = !!currentTop?.isPinned;
    setDeckFront(shownIsStarred ? null : id);
    setDeckBack((prev) => prev.filter((x) => x !== id));
  };

  /**
   * Passage obligé pour terminer une tâche, quel que soit l'endroit d'où on
   * clique : la carte comme la liste. On ne demande que ce qui s'applique.
   */
  const requestComplete = (id: string) => {
    const task = store.tasks.find((t) => t.id === id);
    if (!task) return;
    if (task.completedDate) {
      store.toggleComplete(id); // décocher : rien à confirmer
      return;
    }
    if ((task.subtasks ?? []).some((s) => !s.done)) {
      setPendingComplete({ id, step: "subtasks" });
      return;
    }
    if ((task.note ?? "").trim()) {
      setPendingComplete({ id, step: "note" });
      return;
    }
    store.completeTask(id, false);
  };

  const pendingTask = pendingComplete
    ? (store.tasks.find((t) => t.id === pendingComplete.id) ?? null)
    : null;

  const handleCompleteConfirm = (keepNote: boolean) => {
    if (!pendingComplete || !pendingTask) return;
    // Les étapes validées, on enchaîne sur le sort de la note s'il y en a une.
    if (
      pendingComplete.step === "subtasks" &&
      (pendingTask.note ?? "").trim()
    ) {
      setPendingComplete({ id: pendingComplete.id, step: "note" });
      return;
    }
    store.completeTask(pendingComplete.id, keepNote);
    setPendingComplete(null);
  };

  /** Depuis le paquet, ramène la tâche à aujourd'hui si besoin et la met en cours. */
  const handlePromoteToTop = (id: string) => {
    const task = store.tasks.find((t) => t.id === id);
    if (!task) return;
    const isLater =
      !!task.scheduledDate &&
      task.scheduledDate.slice(0, 10) > toLocalISODate(new Date());
    if (isLater) store.bringToToday(id);
    // Choix délibéré depuis le paquet : ce n'est pas une interruption, on oublie la reprise.
    setResumeTaskId(null);
    /*
     * Remonter une tâche en tête n'est pas la mettre en favori.
     *
     * Les deux passaient par `pinnedTaskId` : depuis que l'étoile affiche cet
     * état, choisir une tâche dans le paquet l'étoilait sans qu'on l'ait
     * demandé — et une tâche étoilée est reforcée en tête à chaque retour sur
     * l'onglet, donc elle revenait sans fin.
     *
     * L'ordre du paquet vit maintenant ici, le temps de la session. L'étoile
     * reste ce qu'elle est : un choix, et seulement un choix.
     */
    setDeckFront(id);
    setDeckBack((prev) => prev.filter((x) => x !== id));
    setTab("cards");
  };

  /** Une tâche arbitrée passe derrière celles qui ne le sont pas encore. */
  const handleDeckPushBack = (id: string) => {
    setDeckBack((prev) => [...prev.filter((x) => x !== id), id]);
    setDeckFront((f) => (f === id ? null : f));
  };

  /**
   * L'étoile de la carte : met la tâche en tête du paquet, ou l'en retire.
   *
   * `handlePromoteToTop` ne sait qu'épingler. Sans le retrait, l'étoile
   * s'allumait sans jamais pouvoir s'éteindre.
   *
   * Une seule tâche à la fois porte l'étoile : c'est le modèle existant, et
   * l'écran Cartes n'en montre qu'une de toute façon.
   */
  const handleTogglePin = (id: string) => {
    store.pinTask(id);
  };

  const handleDueDoNow = () => {
    if (!dueTask) return;
    setDismissedUntil((p) => ({ ...p, [dueTask.id]: FOREVER }));
    // On mémorise ce qu'on était en train de faire pour y revenir après.
    setResumeTaskId(
      currentTop && currentTop.id !== dueTask.id ? currentTop.id : null,
    );
    store.pinTask(dueTask.id);
    setTab("cards");
  };

  const handleDueFinishFirst = () => {
    if (!dueTask) return;
    setDismissedUntil((p) => ({ ...p, [dueTask.id]: FOREVER }));
    // La tâche se glisse juste derrière celle en cours. Si celle-ci est épinglée,
    // elle est de toute façon remontée en tête par buildStack : il suffit alors de
    // mettre la nouvelle en tête du tableau pour qu'elle devienne la carte n°2.
    const topIsPinned = !!currentTop?.isPinned;
    store.placeAfterTask(
      dueTask.id,
      topIsPinned ? null : (currentTop?.id ?? null),
    );
    setToast("Placée juste après");
  };

  const handleDueSnooze = () => {
    if (!dueTask) return;
    setDismissedUntil((p) => ({ ...p, [dueTask.id]: Date.now() + SNOOZE_MS }));
  };

  const previewTask = store.tasks.find((task) => task.id === previewTaskId);
  const inspectTask = (id: string) => {
    setSearchOpen(false);
    setPreviewTaskId(id);
  };

  return (
    <div className="app-shell flex flex-col">
      <BrandHeader
        onOpenSettings={() => setSettingsOpen(true)}
        onSearch={() => setSearchOpen(true)}
      />
      <main
        className={`app-main flex-1 min-h-0 transition-opacity duration-150 ${
          transitioning ? "opacity-0" : "opacity-100"
        }`}
      >
        {tab === "today" && (
          <TodayView
            tasks={store.todayTasks}
            onToggle={requestComplete}
            onDelete={store.deleteTask}
            onEditTitle={store.updateTaskTitle}
            onPin={store.pinTask}
            onClearCompleted={store.clearCompleted}
            pinnedTaskId={pinnedTaskId}
            onOpenCard={handlePromoteToTop}
            onStart={() => addInputRef.current?.focus()}
          />
        )}
        {tab === "later" && (
          <LaterView
            tasks={store.laterTasks}
            onToggle={requestComplete}
            onDelete={store.deleteTask}
            onEditTitle={store.updateTaskTitle}
            onBringToToday={store.bringToToday}
            onOpenCard={inspectTask}
          />
        )}
        {tab === "cards" && (
          <CardsView
            todayTasks={store.todayTasks}
            laterTasks={store.laterTasks}
            pinnedTaskId={pinnedTaskId}
            onComplete={requestComplete}
            onPostpone={store.postponeToTomorrow}
            onPromoteToTop={handlePromoteToTop}
            onInspectTask={inspectTask}
            onEditTitle={store.updateTaskTitle}
            onRecurrenceChange={store.setTaskRecurrence}
            onReschedule={store.rescheduleTask}
            onTogglePin={handleTogglePin}
            deckFront={deckFront}
            deckBack={deckBack}
            onPushBack={handleDeckPushBack}
            onSetNote={store.setTaskNote}
            onAddSubtask={store.addSubtask}
            onToggleSubtask={store.toggleSubtask}
            onDeleteSubtask={store.deleteSubtask}
          />
        )}
        {tab === "notes" && (
          <NotesView
            notes={store.notes}
            onAdd={store.addNote}
            onUpdate={store.updateNote}
            onDelete={store.deleteNote}
          />
        )}
      </main>

      {searchOpen && (
        <SearchSheet
          tasks={store.tasks}
          notes={store.notes}
          onClose={() => setSearchOpen(false)}
          onSelectTask={inspectTask}
          onUpdateNote={store.updateNote}
        />
      )}
      {previewTask && (
        <TaskPreviewSheet
          key={previewTask.id}
          task={previewTask}
          onClose={() => setPreviewTaskId(null)}
          onOpenCard={(id) => {
            setPreviewTaskId(null);
            handlePromoteToTop(id);
          }}
          onEditTitle={store.updateTaskTitle}
          onSetNote={store.setTaskNote}
          onToggleSubtask={store.toggleSubtask}
          onRecurrenceChange={store.setTaskRecurrence}
        />
      )}

      <CompleteTaskDialog
        task={pendingTask}
        step={pendingComplete?.step ?? null}
        onConfirm={handleCompleteConfirm}
        onCancel={() => setPendingComplete(null)}
      />

      <DueTaskBanner
        task={dueTask}
        currentTitle={currentTop?.title ?? null}
        onDoNow={handleDueDoNow}
        onFinishFirst={handleDueFinishFirst}
        onSnooze={handleDueSnooze}
      />

      {/* Annulation prioritaire sur le toast simple : c'est la seule des deux qui agit. */}
      {store.undoState ? (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 pl-4 pr-1.5 py-1.5 rounded-full bg-idayal-text text-white shadow-elev animate-slide-in-up"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 132px)" }}
        >
          <span className="text-[13px] font-medium whitespace-nowrap">
            {store.undoState.label}
          </span>
          <button
            type="button"
            onClick={store.undo}
            className="px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-[13px] font-semibold whitespace-nowrap active:scale-95 transition"
          >
            Annuler
          </button>
        </div>
      ) : (
        toast && (
          <div
            className="fixed left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-idayal-text text-white text-[13px] font-medium shadow-elev animate-slide-in-up"
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 132px)" }}
          >
            {toast}
          </div>
        )
      )}

      {/* La barre de saisie est disponible partout : noter ne doit jamais demander de naviguer. */}
      <QuickAddBar onAdd={handleAdd} inputRef={addInputRef} />

      <TabBar
        active={tab}
        onChange={handleTab}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={store.settings}
        onUpdateSettings={store.updateSettings}
        onCleanCompleted={() => store.cleanOldCompleted(30)}
        onExport={store.exportJSON}
        onImport={store.importJSON}
        appVersion={APP_VERSION}
        sync={sync}
      />
    </div>
  );
}
