import assert from 'node:assert/strict';
import { createRecurrence, isRecurrenceRule, nextRecurrenceDate, nextRecurringTask, parseRecurringTask, reconcileRecurringTasks } from '../recurrence';
import type { RecurrenceRule, Task } from '../../types/task';
process.env.TZ = 'Europe/Paris';
let count = 0;
function check(name: string, run: () => void) { run(); count++; console.log('ok  ' + name); }
const at = (iso: string) => new Date(iso);
const rule = (frequency: RecurrenceRule['frequency'], anchorDate: string): RecurrenceRule => ({ frequency, anchorDate, seriesId: 'plants' });
const task = (recurrence: RecurrenceRule, rest: Partial<Task> = {}): Task => ({
  id: 'plants', title: 'Arroser les plantes', createdDate: '2026-09-06', originalDate: '2026-09-06',
  scheduledDate: recurrence.anchorDate, completedDate: null, isCarriedOver: false, recurrence, ...rest,
});

check('Une récurrence quotidienne sans heure commence aujourd’hui', () =>
  assert.equal(nextRecurrenceDate(rule('daily', '2026-09-10'), at('2026-09-10T23:55')), '2026-09-10'));
check('Une heure déjà passée avance au lendemain', () =>
  assert.equal(nextRecurrenceDate(rule('daily', '2026-09-10T09:00'), at('2026-09-10T23:55')), '2026-09-11T09:00'));
check('Une heure future reste aujourd’hui', () =>
  assert.equal(nextRecurrenceDate(rule('daily', '2026-09-10T09:00'), at('2026-09-10T08:00')), '2026-09-10T09:00'));
check('Une série future ne commence pas en avance', () =>
  assert.equal(nextRecurrenceDate(rule('daily', '2026-10-01T09:00'), at('2026-09-10T08:00')), '2026-10-01T09:00'));
check('Terminer demain en avance ne recrée pas demain', () =>
  assert.equal(nextRecurrenceDate(rule('daily', '2026-09-10T09:00'), at('2026-09-10T08:00'), '2026-09-11T09:00'), '2026-09-12T09:00'));
check('Une occurrence sans heure consomme sa journée entière', () =>
  assert.equal(nextRecurrenceDate(rule('daily', '2026-09-10T09:00'), at('2026-09-10T08:00'), '2026-09-10'), '2026-09-11T09:00'));
check('Chaque dimanche reste dimanche après un report au mardi', () =>
  assert.equal(nextRecurrenceDate(rule('weekly', '2026-09-06T09:30'), at('2026-09-08T18:00'), '2026-09-08'), '2026-09-13T09:30'));
check('Les semaines manquées ne génèrent pas de retard', () =>
  assert.equal(nextRecurrenceDate(rule('weekly', '2026-09-06T09:30'), at('2026-10-01T18:00'), '2026-09-06T09:30'), '2026-10-04T09:30'));
check('Le vendredi terminé poursuit le lundi', () =>
  assert.equal(nextRecurrenceDate(rule('weekdays', '2026-09-11T09:00'), at('2026-09-11T10:00'), '2026-09-11T09:00'), '2026-09-14T09:00'));
check('Une nouvelle tâche de semaine créée samedi commence lundi', () =>
  assert.equal(nextRecurrenceDate(rule('weekdays', '2026-09-12'), at('2026-09-12T10:00')), '2026-09-14'));
check('Le 31 janvier passe au dernier jour de février', () =>
  assert.equal(nextRecurrenceDate(rule('monthly', '2027-01-31T09:15'), at('2027-01-31T10:00'), '2027-01-31T09:15'), '2027-02-28T09:15'));
check('Le jour 31 est restauré en mars après février', () =>
  assert.equal(nextRecurrenceDate(rule('monthly', '2027-01-31T09:15'), at('2027-02-28T10:00'), '2027-02-28T09:15'), '2027-03-31T09:15'));
check('Février bissextile utilise le 29', () =>
  assert.equal(nextRecurrenceDate(rule('monthly', '2028-01-31'), at('2028-01-31T10:00'), '2028-01-31'), '2028-02-29'));
check('Un retard mensuel saute les créneaux passés', () =>
  assert.equal(nextRecurrenceDate(rule('monthly', '2026-01-31T09:00'), at('2026-09-30T10:00'), '2026-01-31T09:00'), '2026-10-31T09:00'));
check('L’heure locale est conservée au passage à l’heure d’été', () =>
  assert.equal(nextRecurrenceDate(rule('daily', '2027-03-27T09:00'), at('2027-03-27T10:00'), '2027-03-27T09:00'), '2027-03-28T09:00'));
check('L’heure locale est conservée au passage à l’heure d’hiver', () =>
  assert.equal(nextRecurrenceDate(rule('daily', '2026-10-24T09:00'), at('2026-10-24T10:00'), '2026-10-24T09:00'), '2026-10-25T09:00'));
check('Une échéance ISO UTC est normalisée sans perdre l’heure', () =>
  assert.equal(createRecurrence('weekly', '2026-09-13T07:30:00.000Z').anchorDate, '2026-09-13T09:30'));
check('Les règles invalides sont ignorées', () => {
  assert.equal(isRecurrenceRule({ frequency: 'daily', anchorDate: '2026-02-31' }), false);
  assert.equal(isRecurrenceRule({ frequency: 'every_second', anchorDate: '2026-09-10' }), false);
  assert.equal(isRecurrenceRule(null), false);
});
check('La prochaine occurrence conserve titre et note mais réinitialise les étapes', () => {
  const source = task(rule('weekly', '2026-09-06T09:00'), { note: 'ancienne note', isPinned: true, subtasks: [{ id: 'step', title: 'Vérifier la terre', done: true }] });
  const next = nextRecurringTask(source, at('2026-09-06T10:00'))!;
  assert.equal(next.title, source.title); assert.equal(next.scheduledDate, '2026-09-13T09:00');
  assert.equal(next.note, 'ancienne note'); assert.equal(next.isPinned, false); assert.equal(next.subtasks?.[0].done, false);
  assert.equal(source.note, 'ancienne note'); assert.equal(source.subtasks?.[0].done, true);
});
check('Deux appareils fabriquent le même identifiant', () => {
  const source = task(rule('weekly', '2026-09-06T09:00'));
  assert.equal(nextRecurringTask(source, at('2026-09-06T10:00'))?.id, nextRecurringTask(source, at('2026-09-07T18:00'))?.id);
});
check('Une tâche complétée par Cockpit reçoit exactement un successeur', () => {
  const source = task(rule('weekly', '2026-09-06T09:00'), { completedDate: '2026-09-06T10:00' });
  const next = reconcileRecurringTasks([source], at('2026-09-06T10:00'));
  assert.equal(next.length, 2); assert.equal(next.filter(t => !t.completedDate).length, 1);
  assert.equal(next[0].recurrenceNextId, next[1].id);
  assert.equal(reconcileRecurringTasks(next, at('2026-09-06T10:00')), next);
});
check('Une occurrence reportée ne se multiplie pas au fil des semaines', () => {
  const source = task(rule('weekly', '2026-09-06'), { isCarriedOver: true, scheduledDate: '2026-10-01' });
  const tasks = [source]; assert.equal(reconcileRecurringTasks(tasks, at('2026-10-01T10:00')), tasks);
});
check('Finir le retard avant l’heure du jour permet la prochaine occurrence du jour', () => {
  const source = task(rule('daily', '2026-09-09T09:00'), {
    isCarriedOver: true, originalDate: '2026-09-09', scheduledDate: '2026-09-10',
  });
  assert.equal(nextRecurringTask(source, at('2026-09-10T08:00'))?.scheduledDate, '2026-09-10T09:00');
  assert.equal(nextRecurringTask(source, at('2026-09-10T10:00'))?.scheduledDate, '2026-09-11T09:00');
});
check('Le successeur supprimé ne réapparaît pas', () => {
  const source = task(rule('weekly', '2026-09-06'), { completedDate: '2026-09-06T10:00', recurrenceNextId: 'deleted-successor' });
  const tasks = [source]; assert.equal(reconcileRecurringTasks(tasks, at('2026-10-01T10:00')), tasks);
});
check('Un successeur déjà actif interdit une deuxième occurrence', () => {
  const source = task(rule('weekly', '2026-09-06'), { completedDate: '2026-09-06T10:00' });
  const next = nextRecurringTask(source, at('2026-09-06T10:00'))!;
  const result = reconcileRecurringTasks([source, next], at('2026-09-06T10:00'));
  assert.equal(result.length, 2); assert.equal(result[0].recurrenceNextId, next.id);
});
check('Décocher depuis Cockpit remplace le successeur par l’occurrence rouverte', () => {
  const source = task(rule('weekly', '2026-09-06'));
  const next = nextRecurringTask(source, at('2026-09-06T10:00'))!;
  const result = reconcileRecurringTasks([{ ...source, recurrenceNextId: next.id }, next], at('2026-09-06T10:00'));
  assert.equal(result.length, 1); assert.equal(result[0].id, source.id); assert.equal(result[0].completedDate, null);
  assert.equal(result[0].recurrenceNextId, undefined);
  assert.equal(reconcileRecurringTasks(result, at('2026-09-06T10:00')), result);
});
check('Une réouverture conserve les tâches ordinaires et l’historique', () => {
  const source = task(rule('weekly', '2026-09-06'), { recurrenceNextId: 'middle' });
  const middle = { ...source, id: 'middle', completedDate: '2026-09-13T10:00', scheduledDate: '2026-09-13', recurrenceNextId: 'last' };
  const last = { ...source, id: 'last', scheduledDate: '2026-09-20', recurrenceNextId: undefined };
  const ordinary = { ...source, id: 'ordinary', recurrence: undefined, recurrenceNextId: undefined };
  const result = reconcileRecurringTasks([source, middle, last, ordinary], at('2026-09-14T10:00'));
  assert.deepEqual(result.map(t => t.id), ['plants', 'middle', 'ordinary']);
});
check('Recompléter une ancienne occurrence saute celles déjà terminées à l’avance', () => {
  const source = task(rule('daily', '2026-09-10'), { scheduledDate: '2026-09-10' });
  const tomorrow = { ...source, id: 'plants:occ:2026-09-11', completedDate: '2026-09-10T09:00', scheduledDate: '2026-09-11', recurrenceNextId: 'plants:occ:2026-09-12' };
  const next = nextRecurringTask(source, at('2026-09-10T10:00'), [source, tomorrow])!;
  assert.equal(next.scheduledDate, '2026-09-12');
  const adopted = reconcileRecurringTasks([{ ...source, completedDate: '2026-09-10T10:00' }, tomorrow], at('2026-09-10T10:00'));
  assert.equal(adopted.filter(t => !t.completedDate).length, 1);
  assert.equal(adopted.find(t => !t.completedDate)?.scheduledDate, '2026-09-12');
});
check('Les anciennes données sans récurrence restent identiques', () => {
  const { recurrence, ...old } = task(rule('daily', '2026-09-10'));
  const tasks = [old]; assert.equal(reconcileRecurringTasks(tasks), tasks);
});
check('Chaque dimanche est compris sans garder le motif dans le titre', () => {
  const parsed = parseRecurringTask('Arroser les plantes chaque dimanche', at('2026-09-10T12:00'));
  assert.equal(parsed.title, 'Arroser les plantes'); assert.equal(parsed.scheduledDate, '2026-09-13');
  assert.equal(parsed.recurrence?.frequency, 'weekly');
});
check('La récurrence naturelle conserve une heure explicite', () => {
  const parsed = parseRecurringTask('Arroser chaque dimanche à 9h30', at('2026-09-10T12:00'));
  assert.equal(parsed.title, 'Arroser'); assert.equal(parsed.scheduledDate, '2026-09-13T09:30');
});
check('Une heure passée un dimanche passe au dimanche suivant', () =>
  assert.equal(parseRecurringTask('Arroser chaque dimanche à 9h', at('2026-09-13T12:00')).scheduledDate, '2026-09-20T09:00'));
check('Chaque mois conserve la date écrite', () => {
  const parsed = parseRecurringTask('Vérifier les comptes chaque mois le 31 janvier à 9h', at('2026-12-10T10:00'));
  assert.equal(parsed.title, 'Vérifier les comptes'); assert.equal(parsed.scheduledDate, '2027-01-31T09:00');
});
check('Un texte sans répétition reste disponible pour le parseur habituel', () =>
  assert.deepEqual(parseRecurringTask('Appeler Marie demain à 10h'), { title: 'Appeler Marie demain à 10h', recurrence: null, scheduledDate: null }));
console.log(`\n${count} réussis, 0 échoués`);
