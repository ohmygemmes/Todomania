import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const context = await browser.newContext({ timezoneId: 'Europe/Paris' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const settle = () => page.waitForTimeout(60);
const state = () => page.evaluate(() => ({ tasks: window.testStore.tasks, notes: window.testStore.notes }));
let checks = 0;
const pass = name => { checks++; console.log('PASS ' + name); };
try {
  // Separate browser profile and empty harness: no account and no cloud hook.
  await page.route(/\/$/, route => route.fulfill({ contentType: 'text/html', body: '<div id="test-root"></div>' }));
  await page.clock.setFixedTime(new Date('2026-09-10T08:00:00Z'));
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/');
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { useTaskStore } = await import('/src/stores/useTaskStore.ts');
    function Harness() { window.testStore = useTaskStore(); return null; }
    window.testRoot = ReactDOM.createRoot(document.getElementById('test-root'));
    window.testRoot.render(React.createElement(React.StrictMode, null, React.createElement(Harness)));
  });
  await page.waitForFunction(() => !!window.testStore);
  const id = await page.evaluate(() => window.testStore.addTask('Arroser', '2026-09-10', { frequency: 'daily', anchorDate: '2026-09-10' }));
  await settle();
  await page.evaluate(id => window.testStore.setTaskNote(id, '250 ml par plante'), id);
  await settle();
  await page.evaluate(id => window.testStore.completeTask(id, true), id);
  await settle();
  let current = await state();
  assert.equal(current.notes.length, 1); assert.equal(current.tasks.length, 2);
  assert.equal(current.tasks.filter(task => !task.completedDate).length, 1);
  assert.equal(current.tasks.find(task => !task.completedDate).note, '250 ml par plante');
  pass('StrictMode : une complétion produit une note et une occurrence suivante');
  await page.evaluate(() => window.testStore.addTask('Tâche ajoutée entre-temps'));
  await settle();
  await page.evaluate(() => window.testStore.undo());
  await settle();
  current = await state();
  assert.equal(current.tasks.length, 2); assert.equal(current.notes.length, 0);
  assert.equal(current.tasks.find(task => task.id === id).note, '250 ml par plante');
  assert(current.tasks.some(task => task.title === 'Tâche ajoutée entre-temps'));
  pass('Annuler retire la prochaine occurrence et la note copiée, conserve les ajouts');
  await page.evaluate(id => window.testStore.completeTask(id, false), id);
  await settle();
  current = await state();
  const nextId = current.tasks.find(task => task.recurrence && !task.completedDate).id;
  assert.equal(current.tasks.find(task => task.id === nextId).note, '250 ml par plante');
  await page.evaluate(id => window.testStore.toggleComplete(id), id);
  await settle();
  current = await state();
  assert.equal(current.tasks.filter(task => task.recurrence && !task.completedDate).length, 1);
  assert.equal(current.tasks.find(task => task.id === nextId), undefined);
  pass('Décocher une occurrence remplace le successeur au lieu de créer un doublon');
  await page.evaluate(id => window.testStore.setTaskRecurrence(id, null), id);
  await settle();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await settle();
  current = await state();
  assert.equal(current.tasks.some(task => task.recurrence), false);
  pass('Désactiver la répétition conserve la tâche ordinaire sans recréation');
  await page.evaluate(() => {
    window.testStore.replaceAll([{ id: 'cockpit', title: 'Routine cochée dans Cockpit', createdDate: '2026-09-09',
      originalDate: '2026-09-09', scheduledDate: '2026-09-09T09:00', completedDate: '2026-09-10T09:00',
      isCarriedOver: false, recurrence: { frequency: 'daily', anchorDate: '2026-09-09T09:00', seriesId: 'cockpit' } }], []);
  });
  await settle();
  current = await state();
  assert.equal(current.tasks.length, 2);
  assert.equal(current.tasks.find(task => !task.completedDate).scheduledDate, '2026-09-11T09:00');
  pass('Adopter une complétion Cockpit crée une seule échéance future');
  await page.evaluate(() => window.testStore.addNote('Note autonome'));
  await settle();
  const backup = await page.evaluate(() => window.testStore.exportJSON());
  await page.evaluate(() => window.testStore.replaceAll([], []));
  await settle();
  assert.equal(await page.evaluate(backup => window.testStore.importJSON(backup), backup), true);
  await settle();
  current = await state();
  assert.equal(current.tasks.length, 2); assert.equal(current.notes[0].text, 'Note autonome');
  assert.equal(current.tasks.find(task => !task.completedDate).recurrence.frequency, 'daily');
  pass('Export/import conserve les récurrences et les notes');
  assert.deepEqual(errors, []);
  console.log(`${checks} vérifications réussies`);
} finally {
  await browser.close();
}
