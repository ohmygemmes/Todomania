import assert from "node:assert/strict";
import {
  canReschedule,
  initialRescheduleDay,
  nextRescheduleDay,
} from "../reschedule";
process.env.TZ = "Europe/Paris";
let count = 0;
const check = (name: string, run: () => void) => {
  run();
  count++;
  console.log("ok  " + name);
};
const late = new Date("2026-09-09T23:55:00");
check("23h55 : une tâche à midi propose le lendemain", () =>
  assert.equal(initialRescheduleDay("2026-09-09T12:00", late), "2026-09-10"),
);
check("23h55 : midi aujourd’hui est refusé", () =>
  assert.equal(canReschedule("2026-09-09", "12:00", late), false),
);
check("23h55 : midi demain est accepté", () =>
  assert.equal(canReschedule("2026-09-10", "12:00", late), true),
);
check("Un jour passé sans heure est refusé", () =>
  assert.equal(canReschedule("2026-09-08", "", late), false),
);
check("Aujourd’hui sans heure reste possible", () =>
  assert.equal(canReschedule("2026-09-09", "", late), true),
);
check("Une heure encore à venir reste aujourd’hui", () =>
  assert.equal(nextRescheduleDay("23:59", late), "2026-09-09"),
);
check("L’heure exacte actuelle est déjà passée", () =>
  assert.equal(nextRescheduleDay("23:55", late), "2026-09-10"),
);
check("Une échéance future conserve son jour", () =>
  assert.equal(initialRescheduleDay("2026-10-12T09:00", late), "2026-10-12"),
);
check("Une vieille échéance propose la prochaine occurrence", () =>
  assert.equal(
    initialRescheduleDay("2026-09-01T18:00", new Date("2026-09-09T10:00:00")),
    "2026-09-09",
  ),
);
check("Passage d’année", () =>
  assert.equal(
    nextRescheduleDay("09:00", new Date("2026-12-31T23:55:00")),
    "2027-01-01",
  ),
);
check("Une date impossible est refusée", () =>
  assert.equal(canReschedule("2026-09-31", "12:00", late), false),
);
check("Un champ vide ou invalide est refusé", () => {
  assert.equal(canReschedule("", "", late), false);
  assert.equal(canReschedule("2026-09-10", "25:00", late), false);
});
check("Une heure inexistante au changement d’heure est refusée", () =>
  assert.equal(canReschedule("2027-03-28", "02:30", late), false),
);
check("Le passage à l’heure d’hiver conserve le jour local", () =>
  assert.equal(
    nextRescheduleDay("09:00", new Date("2026-10-24T23:55:00")),
    "2026-10-25",
  ),
);
console.log(`\n${count} réussis, 0 échoués`);
