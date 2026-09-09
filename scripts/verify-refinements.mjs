import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
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
const output = fileURLToPath(new URL("../outputs/", import.meta.url));
const results = [];
const errors = [];
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  locale: "fr-FR",
  timezoneId: "Europe/Paris",
  colorScheme: "light",
});
const page = await context.newPage();
page.setDefaultTimeout(7000);
page.on("pageerror", (e) => errors.push(e.message));
const tasks = () =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("idayal:tasks:v1") || "[]"),
  );
const wait = () => page.waitForTimeout(450);
const nav = async (name) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: new RegExp("^" + name) })
    .click();
  await wait();
};
const add = async (title) => {
  const input = page.getByRole("textbox", {
    name: "Noter une tâche",
    exact: true,
  });
  await input.fill(title);
  await input.press("Enter");
  await input.press("Escape");
  await wait();
};
const sheet = () => page.getByRole("dialog", { name: "Le bon moment." });
const openSheet = async () => {
  await page.getByRole("button", { name: "Choisir un moment" }).click();
  await sheet().waitFor();
};
const capture = async (name) => {
  await wait();
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: output + name + ".png",
    animations: "disabled",
  });
};
try {
  await page.clock.setFixedTime(new Date("2026-09-09T21:55:00Z"));
  await page.addInitScript(() => {
    localStorage.setItem(
      "idayal:tasks:v1",
      JSON.stringify([
        {
          id: "midday",
          title: "Préparer le bilan",
          createdDate: "2026-09-09",
          originalDate: "2026-09-09",
          scheduledDate: "2026-09-09T12:00",
          completedDate: null,
          isCarriedOver: false,
        },
      ]),
    );
  });
  await page.goto(process.env.APP_URL || "http://127.0.0.1:5173/");
  await nav("Cartes");
  await openSheet();
  assert.equal(
    await page.locator("#reschedule-date").inputValue(),
    "2026-09-10",
  );
  assert(
    await sheet()
      .getByRole("button", { name: /^Aujourd’hui/ })
      .isDisabled(),
  );
  assert(
    (
      await sheet()
        .getByRole("button", { name: /^Demain/ })
        .innerText()
    ).includes("12:00"),
  );
  await capture("10-reprogrammation-2355");
  ok(
    "Mercredi 9 à 23h55 : midi proposé jeudi 10 ; aujourd’hui à midi indisponible.",
  );
  await page.locator("#reschedule-date").fill("2026-09-08");
  assert(
    await sheet()
      .getByRole("button", { name: "Planifier", exact: true })
      .isDisabled(),
  );
  ok("Une date personnalisée passée ne peut pas être validée.");
  await sheet()
    .getByRole("button", { name: /^Demain/ })
    .click();
  assert.equal((await tasks())[0].scheduledDate, "2026-09-10T12:00");
  ok("La reprogrammation enregistre réellement demain à midi.");
  // The natural-language parser now understands "dans une heure"; keep this
  // fixture unscheduled to test the sheet's separate one-hour shortcut.
  await add("Reporter cette tâche");
  await openSheet();
  await sheet()
    .getByRole("button", { name: /Dans 1 heure/ })
    .click();
  assert.equal(
    (await tasks()).find((t) => t.title === "Reporter cette tâche")
      .scheduledDate,
    "2026-09-10T00:55",
  );
  ok("Dans 1 heure franchit minuit correctement : jeudi à 00h55.");
  await page.clock.setFixedTime(new Date("2026-09-10T09:59:59Z"));
  await add("Un moment qui passe");
  await openSheet();
  await sheet().getByRole("button", { name: "12:00", exact: true }).click();
  assert(
    !(await sheet()
      .getByRole("button", { name: /^Aujourd’hui/ })
      .isDisabled()),
  );
  await page.clock.setFixedTime(new Date("2026-09-10T10:00:01Z"));
  await sheet()
    .getByRole("button", { name: /^Aujourd’hui/ })
    .click();
  assert(await sheet().isVisible());
  assert((await sheet().innerText()).includes("Ce moment est déjà passé"));
  assert.equal(
    (await tasks()).find((t) => t.title === "Un moment qui passe")
      .scheduledDate,
    null,
  );
  ok(
    "Une heure qui expire pendant que le panneau reste ouvert est refusée au clic.",
  );
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await wait();
  const mouseDrag = async (dx, dy = 0) => {
    const b = await page.locator(".card-title-area").first().boundingBox();
    const x = b.x + b.width / 2,
      y = b.y + Math.min(30, b.height / 2);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 12 });
    await page.mouse.up();
    await wait();
  };
  await mouseDrag(30);
  assert.equal(await sheet().count(), 0);
  assert(
    !(await tasks()).find((t) => t.title === "Un moment qui passe")
      .completedDate,
  );
  ok("Un petit mouvement à la souris remet la carte en place sans agir.");
  await mouseDrag(20, 100);
  assert.equal(await sheet().count(), 0);
  assert(
    !(await tasks()).find((t) => t.title === "Un moment qui passe")
      .completedDate,
  );
  ok("Un mouvement vertical ne termine pas la carte.");
  await mouseDrag(-230);
  await sheet().waitFor();
  await page.keyboard.press("Escape");
  await wait();
  ok("Glisser à gauche à la souris ouvre la reprogrammation.");
  await mouseDrag(230);
  assert(
    (await tasks()).find((t) => t.title === "Un moment qui passe")
      .completedDate,
  );
  ok("Glisser à droite à la souris termine la tâche.");
  await add("Geste interrompu");
  const b = await page.locator(".card-title-area").first().boundingBox();
  await page.mouse.move(b.x + 100, b.y + 30);
  await page.mouse.down();
  await page.mouse.move(b.x + 180, b.y + 30, { steps: 5 });
  assert.equal(
    await page.locator(".swipe-card").first().getAttribute("data-dragging"),
    "true",
  );
  await page
    .locator(".swipe-card")
    .first()
    .dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  assert.equal(
    await page.locator(".swipe-card").first().getAttribute("data-dragging"),
    "false",
  );
  assert(
    !(await tasks()).find((t) => t.title === "Geste interrompu").completedDate,
  );
  ok("Un geste annulé par le navigateur ne termine aucune tâche.");
  await page.setViewportSize({ width: 390, height: 844 });
  await wait();
  const cdp = await context.newCDPSession(page);
  const touch = async (selector, dx, dy = 0) => {
    const b = await page.locator(selector).first().boundingBox();
    const x = dx < 0 ? b.x + b.width - 20 : b.x + 20,
      y = b.y + Math.min(30, b.height / 2);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let i = 1; i <= 10; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10 }],
      });
      await page.waitForTimeout(10);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await wait();
  };
  await touch(".card-title-area", -210);
  await sheet().waitFor();
  await page.keyboard.press("Escape");
  await wait();
  await touch(".card-title-area", 210);
  assert(
    (await tasks()).find((t) => t.title === "Geste interrompu").completedDate,
  );
  ok(
    "Glisser au doigt vers la gauche puis la droite déclenche les bonnes actions.",
  );
  await add("Glisser une ligne");
  await nav("Aujourd'hui");
  const before = (await tasks()).length;
  await touch(".task-row [data-swipe-title]", -150);
  assert.equal((await tasks()).length, before - 1);
  ok("Le balayage tactile de suppression des lignes reste fonctionnel.");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await wait();
  await nav("Cartes");
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page
    .getByPlaceholder("Ce que tu veux retenir…")
    .fill("Une note à garder sans déplacer la carte.");
  await page.getByPlaceholder("Ce que tu veux retenir…").press("Escape");
  await wait();
  const prior = JSON.stringify(await tasks());
  await touch(".card-details textarea", 130);
  assert.equal(JSON.stringify(await tasks()), prior);
  assert.equal(await sheet().count(), 0);
  ok("Glisser dans la note ne déplace ni ne termine la carte.");
  const packet = await page
    .getByRole("button", { name: /Voir tout le paquet/ })
    .boundingBox();
  const style = await page
    .getByRole("button", { name: /Voir tout le paquet/ })
    .evaluate((el) => getComputedStyle(el).fontSize);
  assert(packet.height >= 44);
  assert(parseFloat(style) >= 14);
  ok("Voir tout le paquet : bouton pleine largeur de 44 px et texte de 14 px.");
  await page.getByRole("button", { name: /Voir tout le paquet/ }).click();
  await page.getByRole("dialog", { name: "Ton paquet" }).waitFor();
  await page.keyboard.press("Escape");
  ok("Le bouton du paquet ouvre sa liste et Échap la referme.");
  assert.deepEqual(errors, []);
  ok("Aucune erreur JavaScript dans les parcours ciblés.");
  await writeFile(
    output + "verification-refinements.json",
    JSON.stringify(
      { date: new Date().toISOString(), checks: results, errors },
      null,
      2,
    ),
  );
} catch (e) {
  await capture("refinements-error");
  throw e;
} finally {
  await browser.close();
}
