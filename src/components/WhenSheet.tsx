import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toLocalISODate, toLocalISODateTime } from "../services/localDate";
import {
  canReschedule,
  initialRescheduleDay,
  nextRescheduleDay,
} from "../services/reschedule";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { Icon } from "./Icon";
interface Props {
  open: boolean;
  title: string;
  current: string | null;
  onPick: (date: string) => void;
  onClose: () => void;
}
export function WhenSheet({ open, ...props }: Props) {
  return open ? createPortal(<WhenContent {...props} />, document.body) : null;
}
function WhenContent({ title, current, onPick, onClose }: Omit<Props, "open">) {
  const [now, setNow] = useState(() => new Date());
  const [time, setTime] = useState(
    current && current.length > 10 ? current.slice(11, 16) : "",
  );
  const [date, setDate] = useState(() =>
    initialRescheduleDay(current, new Date()),
  );
  const [validation, setValidation] = useState("");
  const panel = useDialogFocus(true, onClose);
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const todayISO = toLocalISODate(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = toLocalISODate(tomorrow);
  const todayAvailable = canReschedule(todayISO, time, now);
  const preciseAvailable = canReschedule(date, time, now);
  const choose = (day: string) => {
    const actualNow = new Date();
    if (!canReschedule(day, time, actualNow)) {
      setNow(actualNow);
      setValidation(
        "Ce moment est déjà passé. Choisis une heure ou une date à venir.",
      );
      return;
    }
    onPick(time ? `${day}T${time}` : day);
    onClose();
  };
  const pickTime = (nextTime: string) => {
    const actualNow = new Date();
    setNow(actualNow);
    setTime(nextTime);
    setValidation("");
    if (!canReschedule(date, nextTime, actualNow))
      setDate(nextRescheduleDay(nextTime, actualNow));
  };
  const inOneHour = () => {
    const next = new Date(Date.now() + 60 * 60 * 1000);
    onPick(toLocalISODateTime(next));
    onClose();
  };
  const label = (d: Date) =>
    d.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "short",
    });
  const timeHint =
    time && !todayAvailable
      ? `${time} est passé aujourd’hui. Demain, c’est possible.`
      : "Choisis l’heure, puis le jour.";
  return (
    <div
      className="when-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="when-title"
        className="when-sheet"
      >
        <div className="sheet-handle" />
        <div className="sheet-heading">
          <div>
            <h2 id="when-title">Le bon moment.</h2>
            <p>{title}</p>
          </div>
          <button className="icon-button" aria-label="Fermer" onClick={onClose}>
            <Icon name="close" size={19} />
          </button>
        </div>
        <div className="sheet-days">
          <button
            className={`sheet-day ${date === todayISO && todayAvailable ? "recommended" : ""}`}
            disabled={!todayAvailable}
            title={
              !todayAvailable
                ? "Cette heure est déjà passée aujourd’hui"
                : undefined
            }
            onClick={() => choose(todayISO)}
          >
            <Icon name="sun" size={24} />
            <strong>Aujourd’hui</strong>
            <span>{label(now)}</span>
            {time && <em>{todayAvailable ? time : `${time} · déjà passé`}</em>}
          </button>
          <button
            className={`sheet-day ${date === tomorrowISO ? "recommended" : ""}`}
            onClick={() => choose(tomorrowISO)}
          >
            <Icon name="arrow" size={24} />
            <strong>Demain</strong>
            <span>{label(tomorrow)}</span>
            {time && <em>{time}</em>}
          </button>
        </div>
        <button className="sheet-in-hour" onClick={inOneHour}>
          <Icon name="clock" size={17} />
          <span>Dans 1 heure</span>
          <span>
            {new Date(now.getTime() + 3600000).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {toLocalISODate(new Date(now.getTime() + 3600000)) !== todayISO
              ? " · demain"
              : ""}
          </span>
          <Icon name="arrow" size={15} />
        </button>
        <div className="sheet-time">
          <div className="shortcut-label">
            UNE HEURE ?
            <button onClick={() => pickTime("")} aria-pressed={!time}>
              {time ? "Retirer l’heure" : "Sans heure précise"}
            </button>
          </div>
          <div className="sheet-time-options">
            {["09:00", "12:00", "18:00"].map((t) => (
              <button
                key={t}
                aria-label={t}
                className={time === t ? "selected" : ""}
                aria-pressed={time === t}
                onClick={() => pickTime(t)}
              >
                <span>{t}</span>
                {!canReschedule(todayISO, t, now) && date <= tomorrowISO && (
                  <small>demain</small>
                )}
              </button>
            ))}
            <label>
              <input
                type="time"
                aria-label="Heure précise"
                value={time}
                onChange={(e) => pickTime(e.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="sheet-date">
          <label htmlFor="reschedule-date">Ou choisir une autre date</label>
          <div className="sheet-date-controls">
            <input
              id="reschedule-date"
              type="date"
              value={date}
              min={todayISO}
              required
              onChange={(e) => {
                setDate(e.target.value);
                setValidation("");
              }}
            />
            <button
              className="primary-button"
              disabled={!preciseAvailable}
              onClick={() => choose(date)}
            >
              Planifier <Icon name="arrow" size={17} />
            </button>
          </div>
        </div>
        <p className="sheet-help" role="status">
          {validation ||
            (!preciseAvailable
              ? "Choisis une date et une heure à venir."
              : timeHint)}
        </p>
      </div>
    </div>
  );
}
