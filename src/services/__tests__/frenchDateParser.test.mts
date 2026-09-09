import { parseFrenchDate } from '../frenchDateParser';

// Mardi 4 août 2026, 10h00
const NOW = new Date(2026, 7, 4, 10, 0, 0);

let pass = 0;
let fail = 0;

function fmt(d: Date | null): string {
  if (!d) return '(aucune)';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** attendu : null = pas de date, sinon [jour, mois(1-12), année, heure, minute] */
function t(
  input: string,
  expectedTitle: string,
  expected: null | [number, number, number, number, number],
  /** Une heure a-t-elle été écrite ? Par défaut, déduit de l'attendu. */
  expectedHasTime?: boolean,
  now: Date = NOW
) {
  const r = parseFrenchDate(input, now);
  const d = r.detectedDate;
  let ok = r.cleanTitle === expectedTitle;
  const wantHasTime =
    expectedHasTime ?? (expected === null ? false : expected[3] !== 0 || expected[4] !== 0);
  ok = ok && r.hasTime === wantHasTime;
  if (expected === null) {
    ok = ok && d === null;
  } else {
    const [dd, mm, yy, hh, mi] = expected;
    ok =
      ok &&
      !!d &&
      d.getDate() === dd &&
      d.getMonth() === mm - 1 &&
      d.getFullYear() === yy &&
      d.getHours() === hh &&
      d.getMinutes() === mi;
  }
  if (ok) {
    pass++;
    console.log(`  ok   "${input}"`.padEnd(46), '→', `"${r.cleanTitle}"`.padEnd(22), fmt(d));
  } else {
    fail++;
    console.log(`  FAIL "${input}"`.padEnd(46), '→', `"${r.cleanTitle}"`.padEnd(22), fmt(d));
  }
}

console.log('\n--- Le cas signalé : jour + mois sans « le » ---');
t('rdv 3 aout', 'rdv', [3, 8, 2027, 0, 0]); // 3 août déjà passé (on est le 4) → 2027
t('rdv 6 janvier', 'rdv', [6, 1, 2027, 0, 0]); // janvier passé → an prochain
t('rdv 9 mai', 'rdv', [9, 5, 2027, 0, 0]); // mai passé → an prochain
t('paiement 15 septembre', 'paiement', [15, 9, 2026, 0, 0]); // à venir → cette année
t('dentiste 20 aout a 14h30', 'dentiste', [20, 8, 2026, 14, 30]);
t('reunion 12 decembre 9h', 'reunion', [12, 12, 2026, 9, 0]);

console.log('\n--- Avec « le » : doit continuer à marcher ---');
t('rdv le 3 aout', 'rdv', [3, 8, 2027, 0, 0]);
t('paiement le 15 septembre a 10h', 'paiement', [15, 9, 2026, 10, 0]);
t('appel le 3 mai à 14h30', 'appel', [3, 5, 2027, 14, 30]);

console.log('\n--- Accents et casse ---');
t('rdv 3 août', 'rdv', [3, 8, 2027, 0, 0]);
t('rdv 10 FÉVRIER', 'rdv', [10, 2, 2027, 0, 0]);
t('rdv 10 fevrier', 'rdv', [10, 2, 2027, 0, 0]);
t('rdv 1 Décembre', 'rdv', [1, 12, 2026, 0, 0]);

console.log("\n--- C'est le « h » qui fait l'heure, jamais un nombre nu ---");
/*
 * Un nombre nu suivant une date était lu comme une heure, ce qui mangeait le
 * mot dans le titre et posait une heure inventée : « acheter 3 mai 2 pommes »
 * devenait « acheter pommes » à 2h du matin. Rien dans une phrase ne distingue
 * un nombre d'une heure, sauf le « h » (ou le deux-points).
 */
t('acheter 3 mai 2 pommes', 'acheter 2 pommes', [3, 5, 2027, 0, 0]);
t('acheter 12 juin 3 kg de farine', 'acheter 3 kg de farine', [12, 6, 2027, 0, 0]);
t('reunion mardi 5 personnes', 'reunion 5 personnes', [11, 8, 2026, 0, 0]);
// Le prix cité juste après le jour ne doit pas devenir une heure non plus.
t('payer le 15 avril 30 euros', 'payer 30 euros', [15, 4, 2027, 0, 0]);
// Contrepartie assumée : sans « h », le nombre reste dans le titre.
t('course demain 12', 'course 12', [5, 8, 2026, 0, 0]);
// Avec le marqueur, rien ne change.
t('course demain 12h', 'course', [5, 8, 2026, 12, 0]);
t('course demain 12:30', 'course', [5, 8, 2026, 12, 30]);

console.log("\n--- Une date inexploitable n'est pas une date ---");
/*
 * « dans 999999999 jours » écrivait `NaN-NaN-NaN` dans le stockage : la tâche
 * affichait « INVALID DATE » et le restait. Au-delà de l'an 9999, l'année tient
 * sur cinq chiffres, que le format de stockage ne sait pas relire. Dans les
 * deux cas le texte est laissé intact plutôt que mutilé pour rien.
 */
t('archiver dans 999999999 jours', 'archiver dans 999999999 jours', null);
t('archiver dans 10000000 jours', 'archiver dans 10000000 jours', null);
t('archiver dans 1000 jours', 'archiver', [30, 4, 2029, 0, 0]);

console.log('\n--- Les autres formats ne doivent pas casser ---');
t('course demain', 'course', [5, 8, 2026, 0, 0]);
t('rdv mardi 14h', 'rdv', [11, 8, 2026, 14, 0]);
t('rdv lundi prochain', 'rdv', [17, 8, 2026, 0, 0]);
t('X dans 3 jours', 'X', [7, 8, 2026, 0, 0]);
t('X dans 2 semaines', 'X', [18, 8, 2026, 0, 0]);
t('appel a 9h', 'appel', [5, 8, 2026, 9, 0]); // 9h est passé à 10h → demain
t('appel 14h30', 'appel', [4, 8, 2026, 14, 30]); // 14h30 est à venir → aujourd'hui

console.log("\n--- Une heure déjà passée désigne demain ---");
/*
 * Signalé : à 6h27, taper « Test 4h » posait la tâche à 4h le matin même,
 * donc déjà en retard à la seconde où elle est créée. Une heure nue déjà
 * écoulée ne peut désigner qu'aujourd'hui+1.
 */
t('test 4h', 'test', [5, 8, 2026, 4, 0]);          // 4h passé → demain
t('test 9h59', 'test', [5, 8, 2026, 9, 59]);       // une minute trop tard → demain
t('test 10h01', 'test', [4, 8, 2026, 10, 1]);      // une minute d'avance → aujourd'hui
t('test 23h', 'test', [4, 8, 2026, 23, 0]);        // ce soir
t('test a 4h', 'test', [5, 8, 2026, 4, 0]);        // avec « a »
t('test 4:00', 'test', [5, 8, 2026, 4, 0]);        // avec deux-points
// Un jour nommé commande : pas de bascule, même si l'heure est passée.
t('test demain 4h', 'test', [5, 8, 2026, 4, 0]);
t('test le 20 aout a 4h', 'test', [20, 8, 2026, 4, 0]);
t('apres-demain 8h', '', [6, 8, 2026, 8, 0]);

console.log("\n--- Minuit écrit est une heure, l'absence d'heure n'en est pas une ---");
/*
 * « minuit pile » et « pas d'heure » étaient indistinguables : la valeur seule
 * servait de test. « demain 0h » perdait donc son heure, et une tâche sans
 * heure ne déclenche aucun rappel. Le parseur dit maintenant ce que le texte
 * portait.
 */
t('fete demain 0h', 'fete', [5, 8, 2026, 0, 0], true);
t('fete demain 0:00', 'fete', [5, 8, 2026, 0, 0], true);
t('fete demain', 'fete', [5, 8, 2026, 0, 0], false);
t('fete le 20 aout a 0h', 'fete', [20, 8, 2026, 0, 0], true);
t('fete dans 3 jours', 'fete', [7, 8, 2026, 0, 0], false);

console.log('\n--- Pas de fausse détection ---');
t('acheter 2 kg de tomates', 'acheter 2 kg de tomates', null);
t('simple course', 'simple course', null);
t('appeler le plombier', 'appeler le plombier', null);
t('relire le chapitre 3', 'relire le chapitre 3', null);
t('30 fevrier', '30 fevrier', null); // date inexistante → refusée
t('31 avril', '31 avril', null); // avril n'a que 30 jours
t('acheter 3 mais', 'acheter 3 mais', null); // « mais » n'est pas « mai »


console.log('\n--- Le 29 février existe une année sur quatre ---');
/*
 * L'année était choisie après avoir validé le jour : « 29 février » était
 * introuvable depuis 2026 (année non bissextile, abandon sans essayer 2028),
 * et depuis mars 2028 le décalage d'un an débordait sur le 1er mars 2029.
 * On cherche maintenant la prochaine occurrence réelle.
 */
t('anniversaire 29 fevrier', 'anniversaire', [29, 2, 2028, 0, 0]);
t('anniversaire le 29 fevrier a 10h', 'anniversaire', [29, 2, 2028, 10, 0]);
// Une date qui n'existe aucune année reste refusée.
t('reunion 31 avril', 'reunion 31 avril', null);
// Une heure impossible fait tomber le motif, sans partir chercher une autre année.
t('apero le 15 avril a 25h', 'apero le 15 avril a 25h', null);

console.log('\n--- Sans accents, comme on tape vraiment ---');
t('dentiste 20 aout a 14h30', 'dentiste', [20, 8, 2026, 14, 30]);
t('paiement le 15 septembre a 10h', 'paiement', [15, 9, 2026, 10, 0]);
t('appel a 9h', 'appel', [5, 8, 2026, 9, 0]); // 9h est passé à 10h → demain
t('apres-demain 8h', '', [6, 8, 2026, 8, 0]);
t('apres demain', '', [6, 8, 2026, 0, 0]);
t('course demain a 12h', 'course', [5, 8, 2026, 12, 0]);

console.log('\n--- Le « a » nu ne doit pas inventer une heure ---');
t('acheter a 3 euros', 'acheter a 3 euros', null);
t('donner a manger au chat', 'donner a manger au chat', null);

console.log('\n--- Durées à partir de maintenant, chiffres et français naturel ---');
t('rappeler dans 20 minutes', 'rappeler', [4, 8, 2026, 10, 20]);
t('rappeler dans deux heures', 'rappeler', [4, 8, 2026, 12, 0]);
t('rappeler dans une heure', 'rappeler', [4, 8, 2026, 11, 0]);
t('DANS VINGT MINUTES appeler Léa', 'appeler Léa', [4, 8, 2026, 10, 20]);
t('appeler dans vingt et une minutes', 'appeler', [4, 8, 2026, 10, 21]);
t('appeler dans vingt-deux minutes', 'appeler', [4, 8, 2026, 10, 22]);
t('appeler dans dix-sept minutes', 'appeler', [4, 8, 2026, 10, 17]);
t('appeler dans soixante et onze minutes', 'appeler', [4, 8, 2026, 11, 11]);
t('appeler dans quatre-vingts minutes', 'appeler', [4, 8, 2026, 11, 20]);
t('appeler dans quatre-vingt-dix-neuf minutes', 'appeler', [4, 8, 2026, 11, 39]);
t('rappeler dans 90 min', 'rappeler', [4, 8, 2026, 11, 30]);
t('rappeler dans 2h', 'rappeler', [4, 8, 2026, 12, 0]);
t('rappeler dans 2h30', 'rappeler', [4, 8, 2026, 12, 30]);
t('rappeler dans 2 heures 30 minutes', 'rappeler', [4, 8, 2026, 12, 30]);
t('rappeler dans deux heures et vingt minutes', 'rappeler', [4, 8, 2026, 12, 20]);
t('rappeler dans une heure et demie', 'rappeler', [4, 8, 2026, 11, 30]);
t('rappeler dans une demi-heure', 'rappeler', [4, 8, 2026, 10, 30]);
t("rappeler dans un quart d'heure", 'rappeler', [4, 8, 2026, 10, 15]);
t('rappeler dans trois quarts d’heure', 'rappeler', [4, 8, 2026, 10, 45]);
t('rappeler dans une heure et quart', 'rappeler', [4, 8, 2026, 11, 15]);

console.log('\n--- Moments de journée et heure exacte prioritaire ---');
t('rappeler demain matin', 'rappeler', [5, 8, 2026, 9, 0]);
t('rappeler demain après-midi', 'rappeler', [5, 8, 2026, 14, 0]);
t('rappeler demain apres midi', 'rappeler', [5, 8, 2026, 14, 0]);
t('rappeler demain soir', 'rappeler', [5, 8, 2026, 18, 0]);
t('rappeler après-demain matin', 'rappeler', [6, 8, 2026, 9, 0]);
t('rappeler ce soir', 'rappeler', [4, 8, 2026, 18, 0]);
t('rappeler cet après-midi', 'rappeler', [4, 8, 2026, 14, 0]);
t('rappeler ce matin', 'rappeler', [5, 8, 2026, 9, 0]);
t('rappeler demain matin à 10h30', 'rappeler', [5, 8, 2026, 10, 30]);
t('rappeler ce soir a 20h', 'rappeler', [4, 8, 2026, 20, 0]);
t('rappeler demain matin 0h', 'rappeler', [5, 8, 2026, 0, 0], true);
t("rappeler aujourd'hui dans l'après-midi", 'rappeler', [4, 8, 2026, 14, 0]);
t('rappeler aujourd’hui dans l’après-midi', 'rappeler', [4, 8, 2026, 14, 0]);
t('rappeler demain en soirée', 'rappeler', [5, 8, 2026, 18, 0]);

console.log('\n--- À 23h55, passages à demain et changement de mois/année ---');
const LATE = new Date(2026, 8, 9, 23, 55, 0);
t('rappeler dans 20 minutes', 'rappeler', [10, 9, 2026, 0, 15], true, LATE);
t('rappeler dans cinq minutes', 'rappeler', [10, 9, 2026, 0, 0], true, LATE);
t('rappeler dans deux heures', 'rappeler', [10, 9, 2026, 1, 55], true, LATE);
t('rappeler ce soir', 'rappeler', [10, 9, 2026, 18, 0], true, LATE);
t('rappeler cet après-midi', 'rappeler', [10, 9, 2026, 14, 0], true, LATE);
t('rappeler demain matin', 'rappeler', [10, 9, 2026, 9, 0], true, LATE);
t('rappeler 10h', 'rappeler', [5, 8, 2026, 10, 0]); // exacte égalité : prochaine occurrence
t('rappeler ce soir', 'rappeler', [10, 9, 2026, 18, 0], true, new Date(2026, 8, 9, 18, 0));
t('rappeler demain matin', 'rappeler', [1, 1, 2027, 9, 0], true, new Date(2026, 11, 31, 23, 55));
t('rappeler dans 20 minutes', 'rappeler', [1, 1, 2027, 0, 15], true, new Date(2026, 11, 31, 23, 55));

console.log('\n--- Expressions invalides : titre préservé, aucun horaire inventé ---');
for (const input of [
  'rappeler dans zéro minutes',
  'rappeler dans 0 heures',
  'rappeler dans -2h',
  'rappeler dans 1,5h',
  'rappeler dans 1.5 heures',
  'rappeler dans 999999999999999999 heures',
  'rappeler dans deux et trois minutes',
  'rappeler dans vingt-douze minutes',
  'rappeler dans 2h75',
  'rappeler dans 2 heures 90 minutes',
  'rappeler demain matin à 25h',
  'rappeler demain matin à 9h90',
  'rappeler demain matin à 9h5',
  'rappeler ce soir à 250h',
  'rappeler ce soir à 18h600',
  'rappeler à 14h5',
  'rappeler 250h',
  'rappeler dans deux',
  'acheter vingt pommes',
  'rappeler dans 20 minutesmaximum',
]) t(input, input, null);
t('acheter demain matin 2 pommes', 'acheter 2 pommes', [5, 8, 2026, 9, 0]);
t('acheter ce soir 20 euros de pain', 'acheter 20 euros de pain', [4, 8, 2026, 18, 0]);

console.log(`\n${pass} réussis, ${fail} échoués\n`);
if (fail > 0) throw new Error(`${fail} test(s) du parseur en échec`);
