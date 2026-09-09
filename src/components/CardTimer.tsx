import { useCallback, useEffect, useState } from "react";
import {
  create,
  displayedMs,
  formatDuration,
  isFinished,
  isRunning,
  loadTimer,
  saveTimer,
  toggle,
  withMode,
  type RunningTimer,
  type TimerMode,
} from "../services/timer";
import { Icon } from "./Icon";

/** Durées proposées, en minutes. Même forme que les raccourcis d'heure de la saisie. */
const PRESETS = [5, 25, 60];

const MIN = 60_000;

function labelFor(minutes: number): string {
  return minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`;
}

/**
 * Chrono et minuteur d'une tâche.
 *
 * Fonction secondaire : tout tient sur une ligne, sous la tâche, et ne prend une
 * seconde ligne que le temps de choisir une durée. La tâche doit rester ce qu'on
 * lit en premier.
 *
 * Le composant ne compte rien lui-même — il redemande l'heure et laisse
 * `services/timer` faire la soustraction. Le battement de seconde ne sert qu'à
 * rafraîchir l'affichage ; s'il est suspendu en arrière-plan, la valeur reste
 * juste au retour.
 */
export function CardTimer({ taskId }: { taskId: string }) {
  const [timer, setTimer] = useState<RunningTimer | null>(() => {
    const t = loadTimer();
    return t && t.taskId === taskId ? t : null;
  });
  const [mode, setMode] = useState<TimerMode>(() => timer?.mode ?? "up");
  const [duration, setDuration] = useState<number>(
    () => timer?.durationMs ?? 25 * MIN,
  );
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(() => !!timer);

  const commit = useCallback((next: RunningTimer | null) => {
    setTimer(next);
    saveTimer(next);
  }, []);

  // Changer de tâche remet l'écran devant la bonne minuterie.
  useEffect(() => {
    const t = loadTimer();
    const mine = t && t.taskId === taskId ? t : null;
    setTimer(mine);
    setMode(mine?.mode ?? "up");
    setDuration(mine?.durationMs || 25 * MIN);
    setExpanded(!!mine);
  }, [taskId]);

  /*
   * Un battement par seconde, uniquement quand ça tourne — et un rafraîchissement
   * au retour sur l'application, car le battement peut avoir été suspendu pendant
   * que l'écran était éteint.
   */
  const running = !!timer && isRunning(timer);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    const wake = () => setNow(Date.now());
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [running]);

  const active = timer ?? create(taskId, mode, duration);
  const finished = isFinished(active, now);
  const shown = formatDuration(displayedMs(active, now));
  const idle =
    !timer ||
    (!running && displayedMs(active, now) === (mode === "down" ? duration : 0));

  const switchMode = (next: TimerMode) => {
    setMode(next);
    if (next === "down") setDuration(duration || 25 * MIN);
    commit(
      timer ? withMode(timer, next, next === "down" ? duration : 0) : null,
    );
  };

  const pick = (minutes: number) => {
    const ms = minutes * MIN;
    setDuration(ms);
    commit(timer ? withMode(timer, "down", ms) : null);
  };

  const press = () => {
    const t = timer ?? create(taskId, mode, mode === "down" ? duration : 0);
    commit(toggle(t, Date.now()));
    setNow(Date.now());
  };

  const showPresets = mode === "down" && !running;

  if (!expanded && idle) {
    return (
      <div className="card-timer-collapsed" data-swipe-ignore>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          className="timer-disclosure"
        >
          <Icon name="clock" size={15} />
          Chrono / minuteur
        </button>
      </div>
    );
  }

  return (
    <div
      data-swipe-ignore
      className="card-timer relative border-t border-idayal-border dark:border-idayal-border-dark pt-2.5 mt-1 flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        {/* Bascule à deux mots : le même bloc change de sens, rien ne s'ajoute. */}
        <div
          role="group"
          aria-label="Mode de minuterie"
          className="inline-flex gap-0.5 p-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800/70"
        >
          {(["up", "down"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              aria-pressed={mode === m}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
                mode === m
                  ? "bg-white dark:bg-zinc-700 text-idayal-text dark:text-zinc-100 shadow-sm"
                  : "text-idayal-text-muted dark:text-zinc-500"
              }`}
            >
              {m === "up" ? "Chrono" : "Minuteur"}
            </button>
          ))}
        </div>

        <span
          className={`text-[16px] font-semibold tabular ${
            finished
              ? "text-idayal-blue"
              : idle
                ? "text-idayal-text-muted dark:text-zinc-600"
                : "text-idayal-text dark:text-zinc-100"
          }`}
        >
          {shown}
        </span>

        {running && (
          <span
            aria-hidden
            className="w-1.5 h-1.5 rounded-full bg-idayal-blue dark:bg-idayal-blue-light animate-shimmer"
          />
        )}
        {finished && (
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-idayal-blue">
            terminé
          </span>
        )}

        <button
          type="button"
          onClick={press}
          aria-label={running ? "Mettre en pause" : "Démarrer"}
          className="ml-auto flex-shrink-0 w-[29px] h-[29px] rounded-full bg-idayal-blue text-white flex items-center justify-center active:scale-90 transition"
        >
          {running ? (
            <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
              <path d="M8 5l11 7-11 7z" />
            </svg>
          )}
        </button>
        {idle && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="Replier le chrono"
            title="Replier le chrono"
            className="timer-collapse"
          >
            <Icon name="close" size={14} />
          </button>
        )}
      </div>

      {showPresets && (
        <div className="flex gap-1.5">
          {PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => pick(m)}
              aria-pressed={duration === m * MIN}
              className={`px-2.5 py-1 rounded-full text-[12px] font-medium tabular border transition ${
                duration === m * MIN
                  ? "bg-idayal-blue border-idayal-blue text-white font-semibold"
                  : "bg-zinc-100/80 dark:bg-zinc-800/60 border-transparent text-idayal-text-secondary dark:text-zinc-300"
              }`}
            >
              {labelFor(m)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
