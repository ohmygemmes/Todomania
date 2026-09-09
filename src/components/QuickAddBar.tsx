import { useEffect, useMemo, useRef, useState } from "react";
import { parseFrenchDate } from "../services/frenchDateParser";
import { parseRecurringTask, recurrenceLabel } from "../services/recurrence";
import type { RecurrenceRule } from "../types/task";
import { atTimeOfDay, shiftBy } from "../services/dateShortcuts";
import {
  pad2,
  toLocalISODate,
  toLocalISODateTime,
} from "../services/localDate";

interface Props {
  onAdd: (
    title: string,
    scheduledDate: string | null,
    recurrence?: RecurrenceRule | null,
  ) => void;
  /** Ref pilotée par App pour le raccourci clavier de focus (ordinateur). */
  inputRef?: React.RefObject<HTMLInputElement>;
}

/** Heures fixes proposées, posées telles quelles sur le jour retenu. */
const FIXED_TIMES: Array<[number, number]> = [
  [9, 0],
  [12, 0],
  [18, 0],
];

/** Décalages, appliqués à l'heure déjà retenue — pas à l'instant présent. */
const SHIFTS: Array<{ label: string; hours: number }> = [
  { label: "+1h", hours: 1 },
  { label: "+6h", hours: 6 },
  { label: "+24h", hours: 24 },
];

/** Libellé du jour retenu : « Aujourd'hui », « Demain », sinon la date courte. */
function dayPillLabel(iso: string): string {
  const day = iso.slice(0, 10);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  let label: string;
  if (day === toLocalISODate(today)) label = "Aujourd'hui";
  else if (day === toLocalISODate(tomorrow)) label = "Demain";
  else
    label = new Date(day + "T00:00:00").toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });

  const time = iso.length > 10 ? iso.slice(11, 16) : null;
  return time ? `${label}, ${time}` : label;
}

const CalendarIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="17"
    height="17"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.3"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 3v4M16 3v4" />
  </svg>
);

/** Petite flèche au-dessus des heures fixes, comme repère de « poser à ». */
const JumpArrow = () => (
  <svg
    viewBox="0 0 24 24"
    width="11"
    height="11"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="opacity-30"
  >
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/** Bouton d'une rangée groupée (heures fixes, décalages). */
function GroupButton({
  children,
  onClick,
  active,
  arrow,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  arrow?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 px-3 h-11 rounded-full transition-all active:scale-95 ${
        active
          ? "bg-idayal-blue text-white shadow-[0_2px_10px_rgba(59,125,216,0.35)]"
          : "text-idayal-text dark:text-zinc-200"
      }`}
    >
      {arrow && <JumpArrow />}
      <span className="tabular text-[15px] font-medium leading-none">
        {children}
      </span>
    </button>
  );
}

const groupShell =
  "inline-flex items-center gap-0.5 p-1 rounded-full bg-idayal-bg-elev dark:bg-idayal-bg-dark-elev shadow-soft border border-idayal-border dark:border-idayal-border-dark";

export function QuickAddBar({ onAdd, inputRef: externalRef }: Props) {
  const [value, setValue] = useState("");
  /** Date retenue à la main : 'YYYY-MM-DD' ou 'YYYY-MM-DDTHH:mm'. */
  const [manualDate, setManualDate] = useState("");
  /**
   * Date lue dans le texte que l'utilisateur a explicitement écartée.
   *
   * On retient la valeur, pas un simple drapeau : écarter « mardi » ne doit
   * pas masquer la date suivante si la phrase est réécrite en « mercredi ».
   */
  const [ignoredDetected, setIgnoredDetected] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const localRef = useRef<HTMLInputElement>(null);
  const inputRef = externalRef ?? localRef;
  const blurTimer = useRef<number | undefined>(undefined);

  /*
   * Toucher un raccourci retire le focus du champ, ce qui ferait disparaître
   * la rangée avant que le clic n'aboutisse.
   *
   * La première version bloquait le geste avec preventDefault sur pointerdown.
   * Mauvaise idée : sur mobile cela supprime le clic qui suit sans toujours
   * empêcher la perte de focus — le raccourci ne répondait plus et la rangée
   * s'effaçait quand même.
   *
   * On laisse donc le focus partir, mais on retarde la disparition : le clic a
   * le temps d'arriver, et le gestionnaire remet le champ au premier plan.
   */
  const hold = () => window.clearTimeout(blurTimer.current);

  /** Agit, garde la rangée, et rend le clavier au champ pour continuer à taper. */
  const act = (fn: () => void) => () => {
    hold();
    fn();
    inputRef.current?.focus();
  };

  /*
   * Les sélecteurs natifs prennent le focus à la place du champ de saisie.
   * Sans ces deux gestionnaires, la rangée s'effacerait derrière le calendrier
   * pendant qu'il est ouvert. On ne rend donc pas le clavier ici : cela
   * refermerait le sélecteur aussitôt.
   */
  const holdOpen = () => {
    hold();
    setFocused(true);
  };

  /*
   * Au doigt, toucher le champ suffit à ouvrir le sélecteur. À la souris, non :
   * Chrome et Firefox ne l'ouvrent que depuis leur petite icône, que la
   * transparence rend inatteignable — le contrôle serait mort sur ordinateur.
   * `showPicker` couvre ce cas, et n'est appelé que sur pointeur fin pour ne
   * rien changer au tactile, qui fonctionne déjà.
   */
  const openNativePicker = (e: React.MouseEvent<HTMLInputElement>) => {
    if (!window.matchMedia?.("(pointer: fine)").matches) return;
    try {
      e.currentTarget.showPicker();
    } catch {
      // Non supporté, ou déjà ouvert : le comportement par défaut prend le relais.
    }
  };
  const releaseSoon = () => {
    hold();
    blurTimer.current = window.setTimeout(() => setFocused(false), 250);
  };

  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  // Suit le clavier iOS via visualViewport.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(offset);
    };
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);

  const recurringPreview = useMemo(
    () => parseRecurringTask(value.trim()),
    [value],
  );
  // Aperçu de la date détectée par le parser, en live.
  const detectedPreview = useMemo(() => {
    const text = value.trim();
    if (!text) return null;
    if (recurringPreview.recurrence) return recurringPreview.scheduledDate;
    const { detectedDate, hasTime } = parseFrenchDate(text);
    if (!detectedDate) return null;
    return hasTime
      ? toLocalISODateTime(detectedDate)
      : toLocalISODate(detectedDate);
  }, [value, recurringPreview]);

  // Date effective : celle posée à la main prime sur celle lue dans le texte,
  // et une date lue mais écartée ne compte pas.
  const detected =
    detectedPreview && detectedPreview !== ignoredDetected
      ? detectedPreview
      : null;
  const effectiveScheduled = manualDate || detected;
  const chosenDay = effectiveScheduled ? effectiveScheduled.slice(0, 10) : null;

  const tomorrowISO = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toLocalISODate(d);
  })();
  const chosenTime =
    effectiveScheduled && effectiveScheduled.length > 10
      ? effectiveScheduled.slice(11, 16)
      : null;

  /* Les règles de décalage vivent dans services/dateShortcuts, où elles sont
     couvertes par des tests : elles portent des promesses précises (« 12h puis
     +1h donne 13h ») que rien ne rattraperait à la relecture. */
  const applyShift = (hours: number) =>
    setManualDate(shiftBy(effectiveScheduled ?? "", hours, new Date()));

  const setTimeOfDay = (h: number, m: number) =>
    setManualDate(atTimeOfDay(effectiveScheduled ?? "", h, m, new Date()));

  /**
   * Retire la date, d'où qu'elle vienne.
   *
   * La croix n'existait que pour une date posée à la main : une date devinée
   * dans la phrase ne pouvait s'enlever qu'en réécrivant celle-ci. Écarter la
   * date lue est donc mémorisé, le temps que le texte change.
   */
  const clearDate = () => {
    setManualDate("");
    setIgnoredDetected(detectedPreview);
  };

  const submit = () => {
    const text = value.trim();
    if (!text) return;

    /*
     * On enregistre ce que la barre montre, sans re-déduire quoi que ce soit.
     * L'enregistrement reparsait le texte et réappliquait la date lue même
     * après un clic sur la croix : la date revenait, et le mot avait quand
     * même disparu du titre.
     *
     * Quand la date lue est écartée, le texte reste entier — sinon on perdrait
     * à la fois la date et le mot qui l'avait déclenchée. « reunion mardi »
     * reste « reunion mardi ».
     */
    const dismissed =
      !manualDate && detectedPreview !== null && detected === null;
    const { cleanTitle } = parseFrenchDate(text);
    const rule = !dismissed ? recurringPreview.recurrence : null;
    onAdd(
      dismissed ? text : rule ? recurringPreview.title : cleanTitle || text,
      effectiveScheduled || null,
      rule
        ? { ...rule, anchorDate: effectiveScheduled || rule.anchorDate }
        : undefined,
    );

    setValue("");
    setManualDate("");
    setIgnoredDetected(null);
    inputRef.current?.blur();
    hold();
    setFocused(false);
  };

  const showShortcuts = focused;

  return (
    <div
      className="quick-add fixed left-1/2 -translate-x-1/2 w-full max-w-app z-30 px-3"
      data-keyboard={keyboardOffset > 0}
      style={{
        // 82px : la barre d'onglets culmine à 74px du bas, on garde 8px d'écart.
        bottom: keyboardOffset
          ? `calc(${keyboardOffset}px + 8px)`
          : "calc(env(safe-area-inset-bottom) + 82px)",
        transition: "bottom 0.12s ease-out",
      }}
    >
      {/* Raccourcis de date, pendant la saisie seulement. Voir `hold` plus haut
          pour la raison du délai à la perte de focus. */}
      {showShortcuts && (
        /*
          Les rangées reposent sur une surface pleine, elles ne flottent plus.
          Posées à même la page, elles laissaient voir les tâches défiler entre
          elles : trois pastilles isolées au-dessus d'une liste qui transparaissait.
          Un fond opaque les rassemble en un seul objet, entre la liste et le champ.
        */
        <div className="date-shortcuts mb-2 flex flex-col items-start gap-1.5 p-2.5 rounded-[20px] border border-idayal-border dark:border-idayal-border-dark bg-idayal-bg-elev dark:bg-idayal-bg-dark-elev shadow-elev animate-fade-in">
          {/*
            Le jour retenu, toujours actif : sans date explicite une tâche est
            déjà celle du jour, donc « Aujourd'hui » est l'état par défaut, pas
            une absence de choix. Le toucher ouvre le calendrier.
          */}
          <p className="shortcut-label">PRÉVOIR UN MOMENT</p>
          <div className="date-day-row flex items-center gap-1.5">
            <button
              type="button"
              aria-pressed={
                !chosenDay || chosenDay === toLocalISODate(new Date())
              }
              className={`day-choice ${!chosenDay || chosenDay === toLocalISODate(new Date()) ? "selected" : ""}`}
              onClick={act(() => {
                const day = toLocalISODate(new Date());
                setManualDate(chosenTime ? `${day}T${chosenTime}` : day);
              })}
            >
              Aujourd’hui
            </button>
            <button
              type="button"
              aria-pressed={chosenDay === tomorrowISO}
              className={`day-choice ${chosenDay === tomorrowISO ? "selected" : ""}`}
              onClick={act(() =>
                setManualDate(
                  chosenTime ? `${tomorrowISO}T${chosenTime}` : tomorrowISO,
                ),
              )}
            >
              Demain
            </button>
            <div className="calendar-choice">
              <CalendarIcon />
              <span>Date</span>
              <input
                type="date"
                aria-label="Choisir le jour"
                value={chosenDay ?? toLocalISODate(new Date())}
                required
                onClick={openNativePicker}
                onFocus={holdOpen}
                onBlur={releaseSoon}
                onChange={(e) => {
                  hold();
                  if (!e.target.value) return clearDate();
                  setManualDate(
                    chosenTime
                      ? `${e.target.value}T${chosenTime}`
                      : e.target.value,
                  );
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            {effectiveScheduled && (
              <button
                type="button"
                className="clear-date"
                aria-label="Retirer la date"
                onClick={act(clearDate)}
              >
                ×
              </button>
            )}
          </div>

          {/* Heures fixes. */}
          <div className={`time-shortcut-row ${groupShell}`}>
            {FIXED_TIMES.map(([h, m]) => {
              const label = `${pad2(h)}:${pad2(m)}`;
              return (
                <GroupButton
                  key={label}
                  arrow
                  active={chosenTime === label}
                  onClick={act(() => setTimeOfDay(h, m))}
                >
                  {label}
                </GroupButton>
              );
            })}
          </div>

          {/* Décalages, à partir de l'heure retenue. */}
          <div className={`shift-shortcut-row ${groupShell}`}>
            {SHIFTS.map((s) => (
              <GroupButton
                key={s.label}
                onClick={act(() => applyShift(s.hours))}
              >
                {s.label}
              </GroupButton>
            ))}
            {/* Même principe pour l'heure libre : le champ recouvre le bouton. */}
            <div className="relative flex flex-col items-center justify-center px-3 h-11 rounded-full text-idayal-text dark:text-zinc-200 active:scale-95 transition-transform">
              <span className="tabular text-[15px] font-medium leading-none">
                •••
              </span>
              <input
                type="time"
                aria-label="Choisir l'heure"
                value={chosenTime ?? ""}
                onClick={openNativePicker}
                onFocus={holdOpen}
                onBlur={releaseSoon}
                onChange={(e) => {
                  hold();
                  const day = chosenDay ?? toLocalISODate(new Date());
                  setManualDate(
                    e.target.value ? `${day}T${e.target.value}` : day,
                  );
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none bg-transparent border-0 p-0"
              />
            </div>
          </div>
        </div>
      )}

      {effectiveScheduled && (
        <div className="capture-preview" role="status">
          <CalendarIcon />
          <span>
            {dayPillLabel(effectiveScheduled)}
            {recurringPreview.recurrence && (
              <small className="capture-recurrence">
                {recurrenceLabel({
                  ...recurringPreview.recurrence,
                  anchorDate: effectiveScheduled,
                })}
              </small>
            )}
          </span>
          <span className="preview-origin">
            {manualDate ? "Date choisie" : "Compris dans ta phrase"}
          </span>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={`capture-form flex items-center gap-1.5 bg-idayal-bg-elev dark:bg-idayal-bg-dark-elev rounded-[28px] pl-5 pr-2 py-2 transition-all duration-200 ${
          focused
            ? "ring-2 ring-idayal-blue/45 shadow-[0_10px_32px_-6px_rgba(59,125,216,0.40),0_2px_8px_rgba(15,16,32,0.10)]"
            : "ring-1 ring-idayal-blue/15 shadow-[0_8px_28px_-6px_rgba(15,16,32,0.22),0_2px_6px_rgba(15,16,32,0.08)]"
        }`}
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => {
            hold();
            setFocused(true);
            window.setTimeout(() => {
              inputRef.current?.scrollIntoView({
                block: "center",
                behavior: "smooth",
              });
            }, 200);
          }}
          /* Fenêtre volontaire : le temps qu'un tap sur un raccourci aboutisse. */
          onBlur={() => {
            hold();
            blurTimer.current = window.setTimeout(() => setFocused(false), 250);
          }}
          aria-label="Noter une tâche"
          placeholder="Noter une tâche…"
          /* 16px minimum : en dessous, Safari iOS zoome la page à la mise au point. */
          className="flex-1 min-w-0 h-11 bg-transparent outline-none text-[16px] placeholder:text-idayal-text-muted text-idayal-text dark:text-zinc-100"
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="off"
        />
        <button
          type="submit"
          aria-label="Ajouter la tâche"
          disabled={!value.trim()}
          className="w-11 h-11 rounded-full bg-idayal-blue text-white flex items-center justify-center flex-shrink-0 disabled:opacity-30 disabled:bg-idayal-text-muted active:scale-90 transition-all shadow-[0_4px_14px_rgba(59,125,216,0.45)] disabled:shadow-none"
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </form>
      <div className="capture-caption">
        <span>
          Écris comme tu penses.{" "}
          <span className="capture-example">
            « appeler Marie demain à 10h »
          </span>
        </span>
        <kbd className="kbd-hint">N</kbd>
      </div>
    </div>
  );
}
