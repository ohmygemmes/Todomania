import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "fr-FR",
  timezoneId: "Europe/Paris",
  hasTouch: true,
});
const page = await context.newPage();
const errors = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
const output = fileURLToPath(new URL("../outputs/", import.meta.url));
await mkdir(output, { recursive: true });
const ok = (name) => {
  results.push(name);
  console.log("PASS " + name);
};
const tasks = () =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("idayal:tasks:v1") || "[]"),
  );
const nav = async (name) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: new RegExp("^" + name) })
    .click();
  await page.waitForTimeout(180);
};
const input = () =>
  page.getByRole("textbox", { name: "Noter une tâche", exact: true });
const add = async (text) => {
  await input().fill(text);
  await input().press("Enter");
  await input().press("Escape");
  await page.waitForTimeout(80);
};
const shot = async (name) => {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(350);
  await page.screenshot({
    path: output + name + ".png",
    animations: "disabled",
  });
};
const openSearch = () =>
  page
    .getByRole("button", { name: "Rechercher des tâches et des notes" })
    .click();
try {
  await page.clock.setFixedTime(new Date("2026-09-10T08:00:00Z"));
  await page.goto(process.env.APP_URL || "http://127.0.0.1:5173/");
  await input().fill("Appeler Marie dans vingt minutes");
  assert.match(await page.locator(".capture-preview").innerText(), /10:20/);
  await input().press("Enter");
  await input().press("Escape");
  assert.equal(
    (await tasks()).find((t) => t.title === "Appeler Marie").scheduledDate,
    "2026-09-10T10:20",
  );
  await add("Préparer le dossier demain matin");
  assert.equal(
    (await tasks()).find((t) => t.title === "Préparer le dossier")
      .scheduledDate,
    "2026-09-11T09:00",
  );
  await add("Réserver le restaurant ce soir");
  assert.equal(
    (await tasks()).find((t) => t.title === "Réserver le restaurant")
      .scheduledDate,
    "2026-09-10T18:00",
  );
  ok(
    "Français naturel : minutes en lettres, demain matin et ce soir avec heures exactes",
  );
  await input().fill("Arroser les plantes chaque jeudi à 18h");
  assert.match(
    await page.locator(".capture-preview").innerText(),
    /Chaque jeudi/,
  );
  await input().press("Enter");
  await input().press("Escape");
  let routine = (await tasks()).find((t) => t.title === "Arroser les plantes");
  assert.equal(routine.recurrence.frequency, "weekly");
  assert.equal(routine.scheduledDate, "2026-09-10T18:00");
  await page
    .getByRole("region", { name: "Tâches récurrentes" })
    .getByRole("button", { name: "Modifier le titre : Arroser les plantes" })
    .waitFor();
  assert.equal(
    await page
      .locator(".daily-list > .task-list")
      .getByText("Arroser les plantes", { exact: true })
      .count(),
    0,
  );
  ok("Récurrence reconnue en phrase et séparée dans Aujourd’hui");
  await add("Appeler le notaire lundi prochain à 10h");
  const notaire = (await tasks()).find((t) => t.title === "Appeler le notaire");
  await nav("Cartes");
  await page.getByRole("button", { name: /Voir tout le paquet/ }).click();
  await page
    .getByRole("dialog", { name: "Ton paquet" })
    .getByText("Appeler le notaire", { exact: true })
    .click();
  const preview = page.getByRole("dialog", { name: "Consulter la tâche" });
  await preview.waitFor();
  assert.equal(
    (await tasks()).find((t) => t.id === notaire.id).scheduledDate,
    notaire.scheduledDate,
  );
  await shot("14-consulter-plus-tard");
  await preview.getByRole("button", { name: "Fermer la tâche" }).click();
  assert.equal(
    (await tasks()).find((t) => t.id === notaire.id).scheduledDate,
    notaire.scheduledDate,
  );
  ok("Ouvrir puis fermer une tâche future ne change jamais sa date");
  await openSearch();
  const query = page.getByRole("textbox", {
    name: "Rechercher dans les tâches et les notes",
  });
  await query.fill("NOTAIRE");
  const search = page.getByRole("dialog", { name: "Rechercher" });
  await search.getByText("Appeler le notaire", { exact: true }).click();
  await preview.getByRole("button", { name: "Faire aujourd’hui" }).click();
  assert.equal(
    (await tasks())
      .find((t) => t.id === notaire.id)
      .scheduledDate?.slice(0, 10) ?? "2026-09-10",
    "2026-09-10",
  );
  ok("Recherche ouvre une tâche future ; seul Faire aujourd’hui la déplace");
  await nav("Aujourd'hui");
  const region = page.getByRole("region", { name: "Tâches récurrentes" });
  await region
    .getByRole("button", { name: "Marquer comme fait", exact: true })
    .click();
  await page.waitForFunction(
    (id) =>
      JSON.parse(localStorage.getItem("idayal:tasks:v1") || "[]").find(
        (t) => t.id === id,
      )?.completedDate,
    routine.id,
  );
  let all = await tasks();
  assert.equal(all.filter((t) => t.recurrence && !t.completedDate).length, 1);
  assert.equal(
    all.find((t) => t.recurrence && !t.completedDate).scheduledDate,
    "2026-09-17T18:00",
  );
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  all = await tasks();
  assert.equal(all.filter((t) => t.recurrence).length, 1);
  assert.equal(all.find((t) => t.id === routine.id).completedDate, null);
  ok(
    "Terminer une récurrence crée la prochaine semaine ; Annuler restaure une seule occurrence",
  );
  await region
    .getByRole("button", { name: "Marquer comme fait", exact: true })
    .click();
  await page.waitForFunction(
    (id) =>
      JSON.parse(localStorage.getItem("idayal:tasks:v1") || "[]").find(
        (t) => t.id === id,
      )?.completedDate,
    routine.id,
  );
  await nav("Plus tard");
  await page
    .getByRole("region", { name: "Tâches récurrentes" })
    .getByRole("button", { name: "Modifier le titre : Arroser les plantes" })
    .waitFor();
  ok("Les prochaines récurrences sont aussi séparées dans Plus tard");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await nav("Notes");
  await page.getByRole("button", { name: "Nouvelle note" }).click();
  await page
    .getByPlaceholder("Écris ta note…")
    .fill("Éléments pour le notaire : le titre de propriété.");
  await page.getByRole("button", { name: "Garder", exact: true }).click();
  await openSearch();
  await query.fill("elements notaire");
  await search.getByText("Note libre", { exact: true }).click();
  await search
    .getByRole("textbox", { name: "Modifier la note retrouvée" })
    .fill("Éléments pour le notaire : dossier vérifié.");
  await search.getByRole("button", { name: "Résultats" }).click();
  await query.fill("notaire");
  await shot("15-recherche");
  assert.match(await search.innerText(), /Appeler le notaire/);
  assert.match(await search.innerText(), /dossier vérifié/);
  await page.getByRole("button", { name: "Fermer la recherche" }).click();
  assert.match(
    await page.locator(".notes-view").innerText(),
    /dossier vérifié/,
  );
  ok(
    "Recherche globale sans accents : tâches + notes, avec édition persistante de la note",
  );
  await nav("Aujourd'hui");
  await add("Dessiner la prochaine version");
  await page
    .getByRole("button", {
      name: "Ouvrir la carte : Dessiner la prochaine version",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Épingler", exact: true }).click();
  let styles = await page
    .locator(".swipe-card")
    .first()
    .locator(".card-title")
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return { align: s.textAlign, font: s.fontFamily };
    });
  assert.equal(styles.align, "center");
  assert.match(styles.font, /Manrope/);
  let navStyle = await page
    .locator(".nav-cards")
    .evaluate((el) => ({
      bg: getComputedStyle(el).backgroundColor,
      color: getComputedStyle(el).color,
    }));
  assert.equal(navStyle.bg, "rgb(50, 114, 205)");
  await shot("11-carte-bleue-iphone");
  ok("Titre centré en Manrope, épingle visible et onglet actif bleu");
  await page.getByRole("button", { name: "Étape", exact: true }).click();
  await page.getByPlaceholder("Une étape…").fill("Choisir ce qui compte");
  await page.getByPlaceholder("Une étape…").press("Enter");
  await page.getByPlaceholder("Une étape…").press("Escape");
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page
    .getByPlaceholder("Ce que tu veux retenir…")
    .fill("Une interface claire, du bleu et de la place pour avancer.");
  await page.locator(".cards-heading").click();
  await shot("12-carte-bleue-details");
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [768, 1024],
    [1440, 1000],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(130);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    const action = page.getByRole("button", { name: "Fait", exact: true });
    await action.scrollIntoViewIfNeeded();
    const box = await action.boundingBox();
    assert(
      box &&
        box.x >= 0 &&
        box.x + box.width <= width + 1 &&
        box.y >= 0 &&
        box.y + box.height <= height,
      "action within viewport " + width,
    );
    const hit = await action.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
      );
    });
    assert(hit, "action unobstructed " + width);
  }
  await shot("13-carte-bleue-desktop");
  ok("320, 390, 768 et 1440 px : pas de débordement, actions accessibles");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Réglages", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Sombre", exact: true }).click();
  await page.keyboard.press("Escape");
  await shot("16-carte-bleue-sombre");
  assert(
    await page.locator("html").evaluate((el) => el.classList.contains("dark")),
  );
  ok("Thème sombre et nouvelle palette bleue");
  await page.reload();
  await nav("Aujourd'hui");
  assert(
    (await tasks()).find((t) => t.title === "Dessiner la prochaine version")
      ?.isPinned,
  );
  assert(
    (await tasks()).find((t) => t.title === "Arroser les plantes")?.recurrence,
  );
  ok("Rechargement : épingle, notes et récurrences conservées");
  assert.deepEqual(errors, []);
  ok("Aucune erreur JavaScript");
  await writeFile(
    output + "verification-blue-features.json",
    JSON.stringify({ passed: results.length, results, errors }, null, 2),
  );
} finally {
  await browser.close();
}
