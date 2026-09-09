import { toLocalISODate } from "../services/localDate";
import { useMemo } from "react";
import type { Task } from "../types/task";
import { TaskRow } from "./TaskRow";

interface Props {
  tasks: Task[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEditTitle: (id: string, title: string) => void;
  onBringToToday: (id: string) => void;
  onOpenCard?: (id: string) => void;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  // Lundi = 1 ; on ramène à lundi de la semaine courante.
  const day = x.getDay() === 0 ? 7 : x.getDay();
  x.setDate(x.getDate() - (day - 1));
  return x;
}

interface Group {
  key: string;
  label: string;
  items: Task[];
}

function groupTasks(tasks: Task[]): Group[] {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const startThisWeek = startOfWeek(today);
  const startNextWeek = new Date(startThisWeek);
  startNextWeek.setDate(startThisWeek.getDate() + 7);
  const startWeekAfter = new Date(startNextWeek);
  startWeekAfter.setDate(startNextWeek.getDate() + 7);
  const startNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const startMonthAfter = new Date(
    today.getFullYear(),
    today.getMonth() + 2,
    1,
  );

  const groups = new Map<string, Group>();
  const ensure = (key: string, label: string) => {
    if (!groups.has(key)) groups.set(key, { key, label, items: [] });
    return groups.get(key)!;
  };

  for (const t of tasks) {
    if (!t.scheduledDate) continue;
    const d = new Date(
      t.scheduledDate.length > 10
        ? t.scheduledDate
        : t.scheduledDate + "T00:00:00",
    );
    if (d < startNextWeek) ensure("this-week", "Cette semaine").items.push(t);
    else if (d < startWeekAfter)
      ensure("next-week", "Semaine prochaine").items.push(t);
    else if (d < startNextMonth) ensure("this-month", "Ce mois").items.push(t);
    else if (d < startMonthAfter) {
      const label = startNextMonth.toLocaleDateString("fr-FR", {
        month: "long",
        year: "numeric",
      });
      ensure(
        `m-${toLocalISODate(startNextMonth).slice(0, 7)}`,
        label,
      ).items.push(t);
    } else {
      const key = `m-${toLocalISODate(d).slice(0, 7)}`;
      const label = d.toLocaleDateString("fr-FR", {
        month: "long",
        year: "numeric",
      });
      ensure(key, label).items.push(t);
    }
  }

  // Tri interne par date.
  const out = Array.from(groups.values());
  for (const g of out) {
    g.items.sort((a, b) =>
      (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? ""),
    );
  }

  // Ordre des groupes : this-week, next-week, this-month, puis mois suivants chrono.
  const orderHead = ["this-week", "next-week", "this-month"];
  out.sort((a, b) => {
    const ai = orderHead.indexOf(a.key);
    const bi = orderHead.indexOf(b.key);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.key.localeCompare(b.key);
  });

  return out;
}

export function LaterView({
  tasks,
  onToggle,
  onDelete,
  onEditTitle,
  onBringToToday,
  onOpenCard,
}: Props) {
  const groups = useMemo(
    () => groupTasks(tasks.filter((t) => !t.recurrence)),
    [tasks],
  );
  const recurring = useMemo(
    () =>
      tasks
        .filter((t) => !!t.recurrence)
        .sort((a, b) =>
          (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? ""),
        ),
    [tasks],
  );

  return (
    <div className="later-view page-view flex flex-col h-full">
      <header className="page-heading px-5 pt-2 pb-3">
        <p className="text-[12px] uppercase tracking-[0.08em] font-semibold text-idayal-text-muted dark:text-zinc-500 mb-0.5">
          À venir
        </p>
        <h1 className="text-[28px] font-bold text-idayal-text dark:text-zinc-100 tracking-tight2 leading-none">
          Plus tard
        </h1>
        <p className="text-[13px] text-idayal-text-secondary dark:text-zinc-400 mt-1.5">
          <span className="tabular font-semibold text-idayal-text dark:text-zinc-200">
            {tasks.length}
          </span>{" "}
          tâche{tasks.length !== 1 ? "s" : ""} planifiée
          {tasks.length !== 1 ? "s" : ""}
        </p>
      </header>

      <div className="scroll-content flex-1 overflow-y-auto no-scrollbar px-4 pb-48">
        {tasks.length === 0 && (
          <div className="flex flex-col items-center text-center mt-20 px-6">
            <div className="w-16 h-16 rounded-full bg-idayal-blue-soft dark:bg-idayal-blue/15 flex items-center justify-center text-3xl mb-4">
              ↗
            </div>
            <p className="text-[17px] font-semibold text-idayal-text dark:text-zinc-100">
              Rien de prévu
            </p>
            <p className="text-[13px] text-idayal-text-secondary dark:text-zinc-400 mt-1 max-w-[280px]">
              Essaie{" "}
              <span className="text-idayal-blue font-medium">
                « rdv le 15 avril »
              </span>{" "}
              ou{" "}
              <span className="text-idayal-blue font-medium">
                « appeler maman dans 3 jours »
              </span>
              .
            </p>
          </div>
        )}

        {groups.map((g) => (
          <section key={g.key} className="mb-6">
            <div className="px-1 mb-2 flex items-center gap-2">
              <h2 className="text-[11px] uppercase tracking-[0.08em] font-semibold text-idayal-text-muted dark:text-zinc-500">
                {g.label}
              </h2>
              <span className="text-[11px] font-semibold text-idayal-blue tabular">
                {g.items.length}
              </span>
              <span className="flex-1 h-px bg-idayal-border dark:bg-idayal-border-dark" />
            </div>
            <ul>
              {g.items.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onToggle={onToggle}
                  onDelete={onDelete}
                  onEditTitle={onEditTitle}
                  onBringToToday={onBringToToday}
                  onOpenCard={onOpenCard}
                  showDate
                />
              ))}
            </ul>
          </section>
        ))}
        {recurring.length > 0 && (
          <section
            className="recurring-section"
            aria-label="Tâches récurrentes"
          >
            <div className="section-heading recurring-heading">
              <h2>Récurrentes</h2>
              <span>{recurring.length}</span>
            </div>
            <ul className="task-list recurring-list">
              {recurring.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={onToggle}
                  onDelete={onDelete}
                  onEditTitle={onEditTitle}
                  onBringToToday={onBringToToday}
                  onOpenCard={onOpenCard}
                  showDate
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
