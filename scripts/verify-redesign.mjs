import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
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
  viewport: { width: 1440, height: 1000 },
  locale: "fr-FR",
  timezoneId: "Europe/Paris",
  colorScheme: "light",
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
const results = [];
page.on("pageerror", (e) => errors.push(e.message));
const output = fileURLToPath(new URL("../outputs/", import.meta.url));
await mkdir(output, { recursive: true });
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const nav = async (name) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: new RegExp("^" + name) })
    .click();
  await page.waitForTimeout(160);
};
const add = async (text) => {
  const input = page.getByRole("textbox", {
    name: "Noter une tâche",
    exact: true,
  });
  await input.fill(text);
  await input.press("Enter");
  await input.press("Escape");
  await page.waitForTimeout(280);
};
const tasks = () =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("idayal:tasks:v1") || "[]"),
  );
const screenshot = async (name) => {
  await page
    .getByRole("button", { name: "Annuler", exact: true })
    .waitFor({ state: "hidden", timeout: 6500 });
  await page.waitForTimeout(600);
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: output + name + ".png",
    animations: "disabled",
  });
};
try {
  await page.goto(process.env.APP_URL || "http://127.0.0.1:5173/");
  await page
    .getByRole("heading", { name: "Tout commence par une petite chose." })
    .waitFor();
  assert.equal((await tasks()).length, 0);
  ok("État vide : aucune donnée de démonstration injectée dans l’application.");
  await add("Appeler Marie demain à 10h");
  let all = await tasks();
  let t = all.find((t) => t.title === "Appeler Marie");
  assert(t?.scheduledDate.endsWith("T10:00"));
  ok("Saisie naturelle : titre nettoyé et demain à 10 h conservé.");
  await nav("Plus tard");
  await page.getByText("Appeler Marie", { exact: true }).waitFor();
  ok("Une tâche future apparaît dans Plus tard.");
  await page
    .getByRole("textbox", { name: "Noter une tâche", exact: true })
    .fill("Envoyer le dossier");
  await page.getByRole("button", { name: "12:00", exact: true }).click();
  await page.getByRole("button", { name: "+1h", exact: true }).click();
  await page.getByRole("button", { name: "Demain", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Noter une tâche", exact: true })
    .press("Enter");
  await page
    .getByRole("textbox", { name: "Noter une tâche", exact: true })
    .press("Escape");
  all = await tasks();
  assert(
    all
      .find((t) => t.title === "Envoyer le dossier")
      ?.scheduledDate.endsWith("T13:00"),
  );
  ok("Raccourcis : 12 h + 1 h = 13 h ; Demain conserve l’heure.");
  await add("Préparer la présentation");
  await nav("Aujourd'hui");
  await page
    .getByRole("button", {
      name: "Ouvrir la carte : Préparer la présentation",
      exact: true,
    })
    .click();
  await page.locator(".card-title").first().waitFor();
  await page.getByRole("button", { name: "Étape", exact: true }).click();
  await page.getByPlaceholder("Une étape…").fill("Rassembler les idées");
  await page.getByPlaceholder("Une étape…").press("Enter");
  await page.getByPlaceholder("Une étape…").press("Escape");
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page
    .getByPlaceholder("Ce que tu veux retenir…")
    .fill("Commencer par le problème que l’on résout.");
  // Leave the note without invoking the now-editable title.
  await page.locator(".card-kicker").first().click();
  await page.getByRole("button", { name: "Fait", exact: true }).click();
  await page.getByRole("heading", { name: "Il reste 1 étape" }).waitFor();
  await page.getByRole("button", { name: "Terminer", exact: true }).click();
  await page.getByRole("heading", { name: "Garder ta note ?" }).waitFor();
  await page.getByRole("button", { name: "Garder", exact: true }).click();
  await nav("Notes");
  await page
    .getByText("Commencer par le problème que l’on résout.", { exact: true })
    .waitFor();
  ok("Étape et note : confirmations successives, note conservée dans Notes.");
  await add("Faire une pause");
  await nav("Cartes");
  await page.getByRole("button", { name: "Fait", exact: true }).click();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  assert(
    !(await tasks()).find((t) => t.title === "Faire une pause").completedDate,
  );
  ok("Annuler restaure la tâche terminée.");
  await page.keyboard.press("ArrowLeft");
  const dialog = page.getByRole("dialog", { name: "Le bon moment." });
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "18:00", exact: true }).click();
  await dialog.getByRole("button", { name: /^Demain/ }).click();
  assert(
    (await tasks())
      .find((t) => t.title === "Faire une pause")
      .scheduledDate.endsWith("T18:00"),
  );
  ok("Flèche gauche : ouvre Quand et reprogramme avec l’heure choisie.");
  await add("Tester un geste");
  await nav("Cartes");
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await context.newCDPSession(page);
  const swipe = async (from, to) => {
    const box = await page.locator(".card-title-area").first().boundingBox();
    const y = box.y + Math.min(35, box.height / 2);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: from, y }],
    });
    for (let i = 1; i <= 8; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: from + ((to - from) * i) / 8, y }],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  };
  await swipe(310, 45);
  await page.getByRole("dialog", { name: "Le bon moment." }).waitFor();
  await page.keyboard.press("Escape");
  await swipe(50, 320);
  await page.waitForTimeout(300);
  assert(
    (await tasks()).find((t) => t.title === "Tester un geste").completedDate,
  );
  ok("Balayages tactiles : gauche ouvre Quand, droite termine la carte.");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await add("Dessiner la prochaine version");
  await nav("Cartes");
  await page.getByRole("button", { name: "Chrono / minuteur", exact: true }).click();
  await page.getByRole("button", { name: "Démarrer", exact: true }).click();
  await page
    .getByRole("button", { name: "Mettre en pause", exact: true })
    .waitFor();
  await page.waitForTimeout(1100);
  await page
    .getByRole("button", { name: "Mettre en pause", exact: true })
    .click();
  ok("Chronomètre : démarrage, temps écoulé et pause.");
  await page.getByRole("button", { name: "Minuteur", exact: true }).click();
  await page.getByRole("button", { name: "5 min", exact: true }).click();
  assert((await page.locator(".card-timer").innerText()).includes("05:00"));
  ok("Minuteur : preset de 5 minutes affiché.");
  await page.getByRole("button", { name: "Chrono", exact: true }).click();
  await add("Prendre l’air");
  await add("Réserver un week-end");
  await add("Faire le point sur le projet");
  await nav("Aujourd'hui");
  await screenshot("01-aujourdhui-desktop");
  await page
    .getByRole("button", {
      name: "Ouvrir la carte : Dessiner la prochaine version",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Étape", exact: true }).click();
  await page.getByPlaceholder("Une étape…").fill("Trouver le bon équilibre");
  await page.getByPlaceholder("Une étape…").press("Enter");
  await page.getByPlaceholder("Une étape…").press("Escape");
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page
    .getByPlaceholder("Ce que tu veux retenir…")
    .fill(
      "Garder de la place pour l’essentiel. Une interface simple, des gestes naturels.",
    );
  await page.locator(".card-kicker").first().click();
  await screenshot("02-cartes-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot("03-cartes-iphone");
  await page
    .getByRole("button", { name: "Plus tard", exact: true })
    .first()
    .click();
  await screenshot("04-quand-iphone");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  ok("Échap ferme la feuille de reprogrammation.");
  await page
    .getByRole("textbox", { name: "Noter une tâche", exact: true })
    .fill("Appeler le notaire demain à 14h30");
  await screenshot("05-saisie-iphone");
  await page
    .getByRole("textbox", { name: "Noter une tâche", exact: true })
    .fill("");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  await page.getByRole("button", { name: "Sombre", exact: true }).click();
  await page.keyboard.press("Escape");
  assert(
    await page.locator("html").evaluate((el) => el.classList.contains("dark")),
  );
  await screenshot("06-cartes-sombre");
  ok("Réglages et thème sombre opérationnels.");
  for (const [w, h] of [
    [320, 568],
    [390, 844],
    [768, 1024],
    [1440, 1000],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `débordement horizontal ${w}`,
    );
    await page
      .getByRole("button", { name: "Fait", exact: true })
      .scrollIntoViewIfNeeded();
    const actions = await page.locator(".card-actions").first().boundingBox();
    assert(actions && actions.width > 200, `actions visibles ${w}`);
    const capture = await page.locator(".quick-add").boundingBox();
    assert(
      actions.y + actions.height <= capture.y + 2,
      `actions masquées par la saisie ${w}`,
    );
    ok(
      `Disposition ${w} × ${h} : pas de débordement horizontal, actions accessibles.`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await nav("Notes");
  await screenshot("07-notes-iphone");
  await nav("Plus tard");
  await screenshot("08-plus-tard-iphone");
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  await page.getByRole("button", { name: "Clair", exact: true }).click();
  await page.keyboard.press("Escape");
  await nav("Aujourd'hui");
  await screenshot("09-aujourdhui-iphone");
  await page.reload();
  assert((await tasks()).length >= 5);
  ok("Persistance locale après rechargement.");
  assert.deepEqual(errors, []);
  ok("Aucune erreur JavaScript pendant les parcours.");
  await writeFile(
    output + "verification.json",
    JSON.stringify(
      { date: new Date().toISOString(), checks: results, errors },
      null,
      2,
    ),
  );
} catch (e) {
  await screenshot("verification-error");
  throw e;
} finally {
  await browser.close();
}
