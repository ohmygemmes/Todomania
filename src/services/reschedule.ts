import { toLocalISODate } from "./localDate";

/** An undated time never becomes a reminder in the past. Calendar days stay local. */
export function nextRescheduleDay(time: string, now: Date): string {
  const next = new Date(now);
  if (time) {
    const [hour, minute] = time.split(":").map(Number);
    next.setHours(hour, minute, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  }
  return toLocalISODate(next);
}

/** A day without a time means "sometime that day", so today remains valid. */
export function canReschedule(day: string, time: string, now: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T${time || "00:00"}`);
  if (!Number.isFinite(date.getTime()) || toLocalISODate(date) !== day)
    return false;
  if (!time) return day >= toLocalISODate(now);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
  // Reject a nonexistent local time during the spring daylight-saving transition.
  const [hour, minute] = time.split(":").map(Number);
  return (
    date.getHours() === hour &&
    date.getMinutes() === minute &&
    date.getTime() > now.getTime()
  );
}

export function initialRescheduleDay(
  current: string | null,
  now: Date,
): string {
  const time = current && current.length > 10 ? current.slice(11, 16) : "";
  if (current && canReschedule(current.slice(0, 10), time, now))
    return current.slice(0, 10);
  return nextRescheduleDay(time, now);
}
