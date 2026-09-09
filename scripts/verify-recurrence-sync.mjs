import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Real React hooks, an isolated browser, and an entirely in-memory transport.
// No credentials, production session, Supabase client, or external request.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const app = new URL(process.env.APP_URL || 'http://127.0.0.1:5173/');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(app.hostname), 'Local development server required');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});
const NOW = '2026-09-10T10:00:00.000Z';
const output = fileURLToPath(new URL('../outputs/', import.meta.url));
const checks = [];
const errors = [];
const ok = (message) => { checks.push(message); console.log('PASS ' + message); };
const entry = await (await fetch(new URL('/src/main.tsx', app))).text();
const reactModule = entry.match(/"([^"\n]*\/react\.js(?:\?[^"\n]*)?)"/)?.[1];
const reactDomModule = entry.match(/"([^"\n]*\/react-dom_client\.js(?:\?[^"\n]*)?)"/)?.[1];
assert(reactModule && reactDomModule, 'Vite React dependencies must be discoverable');

const mockModule = `
  export const cloudEnabled = true;
  const mock = window.__mock;
  const clone = value => structuredClone(value);
  export async function getSession() { return { user: { id: 'mock-user', email: 'mock@example.test' } }; }
  export function onAuthChange() { return () => {}; }
  export async function pull() {
    mock.pulls++;
    if (!mock.released) await new Promise(resolve => mock.waiters.push(resolve));
    return clone(mock.remote);
  }
  export async function push(userId, state) {
    if (!mock.released) throw new Error('Push before initial pull');
    mock.pushes.push({ userId, state: clone(state) });
    const updatedAt = new Date().toISOString();
    mock.remote = { data: clone(state), updatedAt };
    queueMicrotask(() => mock.listeners.forEach(listener => listener()));
    return updatedAt;
  }
  export async function subscribeToRemoteChanges(_userId, listener) {
    mock.listeners.add(listener);
    return () => mock.listeners.delete(listener);
  }
`;

const html = `<!doctype html><html><body><div id="root"></div><script type="module">
  import React from ${JSON.stringify(reactModule)};
  import ReactDOM from ${JSON.stringify(reactDomModule)};
  import { useTaskStore } from '/src/stores/useTaskStore.ts';
  import { useCloudSync } from '/src/hooks/useCloudSync.ts';
  function Harness() {
    const store = useTaskStore();
    const sync = useCloudSync({ tasks: store.tasks, notes: store.notes, replaceAll: store.replaceAll });
    React.useEffect(() => { window.__store = store; window.__sync = sync; });
    return React.createElement('output', null, JSON.stringify({ tasks: store.tasks, status: sync.status }));
  }
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode, null, React.createElement(Harness)));
</script></body></html>`;

const task = (overrides = {}) => ({
  id: 'ordinary', title: 'Une tâche conservée', createdDate: '2026-09-10',
  scheduledDate: '2026-09-10', completedDate: null,
  originalDate: '2026-09-10', isCarriedOver: false,
  ...overrides,
});

async function openCase(remoteTasks, localTasks = []) {
  const context = await browser.newContext({ locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== app.origin) {
      errors.push('Unexpected external request: ' + url.origin);
      return route.abort();
    }
    if (url.pathname === '/__recurrence_sync_test__') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/src/services/cloudSync.ts') return route.fulfill({ contentType: 'application/javascript', body: mockModule });
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript(({ remoteTasks, localTasks }) => {
    localStorage.clear();
    localStorage.setItem('idayal:tasks:v1', JSON.stringify(localTasks));
    window.__mock = {
      remote: { data: { tasks: remoteTasks, notes: [] }, updatedAt: '2026-09-10T09:59:00.000Z' },
      pulls: 0, pushes: [], waiters: [], listeners: new Set(), released: false,
    };
    window.__releasePull = () => {
      window.__mock.released = true;
      window.__mock.waiters.splice(0).forEach(resolve => resolve());
    };
  }, { remoteTasks, localTasks });
  await page.goto(new URL('/__recurrence_sync_test__', app).href);
  await page.waitForFunction(() => window.__mock.pulls > 0 && window.__store);
  return { page, context };
}

const snapshot = page => page.evaluate(() => ({
  tasks: window.__store.tasks,
  remote: window.__mock.remote,
  pushes: window.__mock.pushes,
  pulls: window.__mock.pulls,
  editedAt: localStorage.getItem('idayal:localEditedAt:v1'),
}));

try {
  {
    const fixture = task();
    const { page, context } = await openCase([fixture]);
    await page.clock.fastForward(2000);
    assert.equal((await snapshot(page)).pushes.length, 0);
    assert.equal((await snapshot(page)).tasks.length, 0);
    ok('Appareil vierge : aucun envoi avant la première lecture distante.');
    await page.evaluate(() => window.__releasePull());
    await page.waitForFunction(() => window.__store.tasks.length === 1 && window.__sync.status === 'idle');
    await page.clock.fastForward(2000);
    const state = await snapshot(page);
    assert.deepEqual(state.tasks, [fixture]);
    assert.equal(state.pushes.length, 0);
    assert.equal(state.editedAt, null);
    ok('Adoption identique : la tâche distante est conservée sans réécriture ni édition fictive.');
    await page.clock.fastForward(31_000);
    assert.equal((await snapshot(page)).pushes.length, 0);
    ok('Lecture périodique suivante : aucun renvoi de l’état adopté identique.');
    await context.close();
  }
  {
    const completed = task({
      id: 'daily', title: 'Arroser', createdDate: '2026-09-09', originalDate: '2026-09-09',
      scheduledDate: '2026-09-09', completedDate: '2026-09-10T11:00',
      recurrence: { frequency: 'daily', anchorDate: '2026-09-09', seriesId: 'daily' },
    });
    const { page, context } = await openCase([completed]);
    await page.evaluate(() => window.__releasePull());
    await page.waitForFunction(() => window.__store.tasks.length === 2);
    await page.clock.fastForward(2000);
    await page.waitForFunction(() => window.__mock.pushes.length === 1 && window.__sync.status === 'idle');
    let state = await snapshot(page);
    assert.equal(state.tasks.filter(t => !t.completedDate).length, 1);
    assert.equal(state.remote.data.tasks.filter(t => !t.completedDate).length, 1);
    assert.equal(JSON.stringify(state.remote.data.tasks), JSON.stringify(state.tasks));
    assert.equal(state.pushes.length, 1);
    assert(state.editedAt);
    ok('Complétion Cockpit : un successeur est créé puis l’état normalisé est envoyé exactement une fois.');
    const stableTasks = structuredClone(state.tasks);
    const previousPulls = state.pulls;
    await page.clock.fastForward(31_000);
    await page.waitForFunction(previous => window.__mock.pulls > previous, previousPulls);
    await page.clock.fastForward(2000);
    state = await snapshot(page);
    assert.equal(state.pushes.length, 1);
    assert.deepEqual(state.tasks, stableTasks);
    ok('Seconde réconciliation : aucune boucle d’envoi, aucun doublon ni décalage de date.');
    await page.clock.fastForward(31_000);
    assert.equal((await snapshot(page)).pushes.length, 1);
    ok('Troisième lecture périodique : le successeur synchronisé reste stable.');
    await page.evaluate(() => {
      window.__mock.remote.data.tasks = window.__mock.remote.data.tasks.map(task =>
        task.id === 'daily' ? { ...task, completedDate: null } : task);
      window.__mock.remote.updatedAt = new Date().toISOString();
      window.__mock.listeners.forEach(listener => listener());
    });
    await page.waitForFunction(() => window.__store.tasks.length === 1 && !window.__store.tasks[0].completedDate);
    await page.clock.fastForward(2000);
    await page.waitForFunction(() => window.__mock.pushes.length === 2);
    state = await snapshot(page);
    assert.equal(state.remote.data.tasks.length, 1);
    assert.equal(state.remote.data.tasks[0].id, 'daily');
    assert.equal(state.remote.data.tasks[0].completedDate, null);
    ok('Décocher depuis Cockpit : une seule occurrence rouverte, le doublon futur est retiré et synchronisé.');
    await page.evaluate(() => window.__store.setTaskRecurrence('daily', null));
    await page.clock.fastForward(2000);
    await page.waitForFunction(() => window.__mock.pushes.length === 3);
    await page.clock.fastForward(31_000);
    state = await snapshot(page);
    assert.equal(state.tasks.length, 1);
    assert.equal(state.tasks[0].recurrence, undefined);
    assert.equal(state.remote.data.tasks[0].recurrence, undefined);
    assert.equal(state.pushes.length, 3);
    ok('Arrêter la répétition : la règle retirée reste retirée après la relecture distante.');
    await context.close();
  }
  {
    const stale = task({ id: 'old-local', title: 'Ancienne version locale' });
    const fresh = task({ id: 'server', title: 'Version distante récente' });
    const { page, context } = await openCase([fresh], [stale]);
    await page.clock.fastForward(2000);
    assert.equal((await snapshot(page)).pushes.length, 0);
    await page.evaluate(() => window.__releasePull());
    await page.waitForFunction(() => window.__store.tasks.some(t => t.id === 'server'));
    await page.clock.fastForward(2000);
    assert.deepEqual((await snapshot(page)).tasks, [fresh]);
    assert.equal((await snapshot(page)).pushes.length, 0);
    ok('Un état local ancien n’écrase pas une version distante plus récente.');
    await context.close();
  }
  assert.deepEqual(errors, []);
  ok('Aucune erreur JavaScript et aucune requête externe pendant les tests.');
  await mkdir(output, { recursive: true });
  await writeFile(output + 'verification-recurrence-sync.json', JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  if (errors.length) console.error(errors);
  throw error;
} finally {
  await browser.close();
}
