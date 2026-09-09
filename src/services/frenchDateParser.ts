export interface ParsedDate {
  cleanTitle: string;
  detectedDate: Date | null;
  /**
   * Une heure a-t-elle été écrite ?
   *
   * On le déduisait de la valeur : « minuit pile, donc pas d'heure ». C'était
   * faux pour « demain 0h », dont l'heure disparaissait — et sans heure,
   * aucun rappel n'est programmé. Seul le texte sait s'il en portait une.
   */
  hasTime: boolean;
}

/** Date construite par un motif, avec le fait qu'une heure ait été lue ou non. */
interface Built {
  date: Date;
  hasTime: boolean;
}

const MONTHS: Record<string, number> = {
  janvier: 0,
  février: 1,
  fevrier: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  août: 7,
  aout: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  décembre: 11,
  decembre: 11,
};

const WEEKDAYS: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
};

const MONTH_PATTERN =
  '(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)';
const WEEKDAY_PATTERN = '(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)';
const DAY_PART_PATTERN = '(matin|apr[eè]s[-\\s]?midi|soir(?:[eé]e)?)';

const SMALL_NUMBERS: Record<string, number> = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5,
  six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
  treize: 13, quatorze: 14, quinze: 15, seize: 16,
};
const TENS: Record<string, number> = {
  vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
};
const NUMBER_WORD = '(?:z[eé]ro|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingts?|trente|quarante|cinquante|soixante)';
const NUMBER_PATTERN = `(?:\\d+|${NUMBER_WORD}(?:[-\\s]+(?:${NUMBER_WORD}|et))*)`;

/** Petits nombres usuels, sans interpréter les nombres qui n'ont pas d'unité. */
function readNumber(text: string): number | null {
  if (/^\d+$/.test(text)) {
    const value = Number(text);
    return Number.isSafeInteger(value) ? value : null;
  }
  const words = text.replace(/é/g, 'e').replace(/vingts\b/g, 'vingt').replace(/-/g, ' ').trim().split(/\s+/);
  const small = SMALL_NUMBERS[words.join(' ')];
  if (small !== undefined) return small;
  if (words[0] === 'dix' && words.length === 2 && ['sept', 'huit', 'neuf'].includes(words[1])) {
    return 10 + SMALL_NUMBERS[words[1]];
  }
  const eighty = words[0] === 'quatre' && words[1] === 'vingt';
  const base = eighty ? 80 : TENS[words[0]];
  if (base === undefined) return null;
  const rest = words.slice(eighty ? 2 : 1);
  if (rest.length === 0) return base;
  if (rest[0] === 'et') {
    // « vingt et un », « soixante et onze » ; jamais « deux et trois ».
    if (eighty || rest.length !== 2 || (rest[1] !== 'un' && rest[1] !== 'une' && !(base === 60 && rest[1] === 'onze'))) return null;
    return base + SMALL_NUMBERS[rest[1]];
  }
  const tail = readNumber(rest.join(' '));
  const maxTail = base === 60 || base === 80 ? 19 : 9;
  return tail !== null && tail > 0 && tail <= maxTail ? base + tail : null;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function nextWeekday(target: number, fromDate: Date, forceNextWeek = false): Date {
  const today = startOfDay(fromDate);
  const cur = today.getDay();
  let diff = (target - cur + 7) % 7;
  if (diff === 0) diff = 7; // si même jour, on prend la semaine suivante
  if (forceNextWeek) diff += 7;
  const out = new Date(today);
  out.setDate(today.getDate() + diff);
  return out;
}

function applyTime(date: Date, hour: number, minute: number): Date {
  const out = new Date(date);
  out.setHours(hour, minute, 0, 0);
  return out;
}

/** Retire la portion match du titre, normalise les espaces. */
function strip(text: string, match: { index: number; length: number }): string {
  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match.length);
  return `${before} ${after}`.replace(/\s+/g, ' ').trim();
}

interface Match {
  index: number;
  length: number;
  date: Date | null;
  hasTime: boolean;
}

/**
 * Une date exploitable par le reste de l'application.
 *
 * « dans 999999999 jours » produisait une date invalide, écrite telle quelle
 * dans le stockage sous la forme `NaN-NaN-NaN` : la tâche restait affichée
 * « INVALID DATE » pour toujours. Au-delà de l'an 9999, la date est valide mais
 * son année tient sur cinq chiffres, ce que le format `YYYY-MM-DD` du stockage
 * et les champs de date du navigateur ne savent pas relire.
 *
 * Rien de tout cela n'est une échéance : c'est du texte mal interprété.
 */
function isUsableDate(d: Date): boolean {
  if (Number.isNaN(d.getTime())) return false;
  const year = d.getFullYear();
  return year >= 1900 && year <= 9999;
}

/** Recherche un motif et renvoie le premier match avec sa position dans le texte original. */
function findMatch(
  lowered: string,
  regex: RegExp,
  builder: (m: RegExpExecArray, now: Date) => Built | null,
  now: Date
): Match | null {
  regex.lastIndex = 0;
  const m = regex.exec(lowered);
  if (!m) return null;
  const built = builder(m, now);
  // Une expression reconnue mais invalide ne doit pas être réinterprétée
  // ensuite comme une heure seule ou comme le seul mot « demain ».
  if (!built || !isUsableDate(built.date)) {
    return { index: m.index, length: m[0].length, date: null, hasTime: false };
  }
  return { index: m.index, length: m[0].length, date: built.date, hasTime: built.hasTime };
}

export function parseFrenchDate(input: string, now: Date = new Date()): ParsedDate {
  const original = input;
  const lowered = input.toLowerCase();

  /*
   * Suffixe d'heure optionnel : « 12h », « 12h30 », « à 12h », « 12:30 ».
   * Les heures sont capturées dans le groupe N, les minutes dans le N+1.
   *
   * C'est le « h » — ou le deux-points, même intention — qui fait l'heure.
   * Un nombre nu n'en est jamais une : « acheter 3 mai 2 pommes » parlait de
   * deux pommes, pas de deux heures du matin, et le mot était retiré du titre
   * en prime. Rien dans une phrase ne distingue un nombre d'une heure, sauf
   * cette lettre.
   *
   * Le « à » reste facultatif et accepté sans accent : personne ne tape les
   * accents au clavier d'un téléphone.
   */
  const TIME = '(?:\\s+(?:[aà]\\s+)?(\\d+)[h:](\\d*)?)?';

  function buildTime(base: Date, hStr?: string, mStr?: string): Built | null {
    if (!hStr) return { date: base, hasTime: false };
    const hour = parseInt(hStr, 10);
    const minute = mStr ? parseInt(mStr, 10) : 0;
    if (hStr.length > 2 || (mStr && mStr.length !== 2) || hour > 23 || minute > 59) return null;
    return { date: applyTime(base, hour, minute), hasTime: true };
  }

  /**
   * Heure seule, sans jour précisé : « 4h », « à 18h30 ».
   *
   * Si l'heure est déjà passée, elle désigne demain. Taper « 4h » à 6h27 ne
   * veut pas dire quatre heures ce matin — c'est déjà fait — et poser la tâche
   * là la fait naître en retard. Même raisonnement que « 6 janvier » en août,
   * qui vise l'année suivante.
   *
   * Ne concerne que les heures nues : dès qu'un jour est nommé (« demain 4h »,
   * « le 15 avril à 4h »), c'est ce jour qui commande.
   */
  function buildTimeToday(n: Date, hStr?: string, mStr?: string): Built | null {
    const built = buildTime(startOfDay(n), hStr, mStr);
    if (!built) return null;
    if (built.date.getTime() <= n.getTime()) built.date.setDate(built.date.getDate() + 1);
    return built;
  }

  function buildDayPart(
    n: Date,
    part: string,
    dayOffset: number | undefined,
    hStr?: string,
    mStr?: string
  ): Built | null {
    const base = startOfDay(n);
    base.setDate(base.getDate() + (dayOffset ?? 0));
    const defaultHour = part === 'matin' ? 9 : part.startsWith('soir') ? 18 : 14;
    const built = buildTime(base, hStr ?? String(defaultHour), mStr);
    if (built && dayOffset === undefined && built.date.getTime() <= n.getTime()) {
      built.date.setDate(built.date.getDate() + 1);
    }
    return built;
  }

  function inMinutes(n: Date, minutes: number): Built | null {
    if (!Number.isSafeInteger(minutes) || minutes <= 0) return null;
    return { date: new Date(n.getTime() + minutes * 60_000), hasTime: true };
  }

  /**
   * Construit une date jour + mois. Sans année précisée, si la date est déjà
   * passée on vise l'année suivante — « 6 janvier » en août veut dire l'an prochain.
   */
  function buildDayMonth(
    day: number,
    month: number,
    hStr: string | undefined,
    mStr: string | undefined,
    n: Date
  ): Built | null {
    const startToday = startOfDay(n).getTime();

    /*
     * On cherche la prochaine occurrence réelle, année par année.
     *
     * L'année était choisie APRÈS avoir validé le jour, ce qui cassait le
     * 29 février deux fois : introuvable depuis 2026 (année non bissextile,
     * abandon sans essayer 2028), et depuis mars 2028 le décalage d'un an
     * débordait silencieusement sur le 1er mars 2029.
     *
     * Huit ans suffisent : c'est le plus grand écart possible entre deux
     * années bissextiles, au passage d'un siècle non divisible par 400.
     */
    for (let ahead = 0; ahead <= 8; ahead++) {
      const base = new Date(n.getFullYear() + ahead, month, day, 0, 0, 0, 0);
      // Un jour qui n'existe pas dans cette année-là (30 février, 31 avril).
      if (base.getMonth() !== month || base.getDate() !== day) continue;
      const built = buildTime(base, hStr, mStr);
      // Une heure impossible fait tomber le motif entier, pas seulement l'année.
      if (!built) return null;
      if (built.date.getTime() >= startToday) return built;
    }
    return null;
  }

  // On essaie les motifs du plus spécifique au moins spécifique.
  const builders: Array<{
    regex: RegExp;
    build: (m: RegExpExecArray, now: Date) => Built | null;
  }> = [
    // Durées : elles doivent passer avant l'heure seule (« dans 2h »).
    {
      regex: /\bdans\s+(?:-\d+(?:[.,]\d+)?|\d+[.,]\d+)\s*(?:heures?|h|minutes?|min)\b/i,
      build: () => null,
    },
    {
      regex: /\bdans\s+(?:une?\s+)?demi[-\s]heure\b/i,
      build: (_m, n) => inMinutes(n, 30),
    },
    {
      regex: /\bdans\s+(un|trois)\s+quarts?\s+d['’]heure\b/i,
      build: (m, n) => inMinutes(n, m[1] === 'trois' ? 45 : 15),
    },
    {
      regex: new RegExp(`\\bdans\\s+(${NUMBER_PATTERN})\\s*h(\\d+)\\b`, 'i'),
      build: (m, n) => {
        const hours = readNumber(m[1]);
        const minutes = Number(m[2]);
        if (hours === null || m[2].length !== 2 || minutes > 59) return null;
        return inMinutes(n, hours * 60 + minutes);
      },
    },
    {
      regex: new RegExp(`\\bdans\\s+(${NUMBER_PATTERN})\\s*(?:heures?|h)(?:\\s*(${NUMBER_PATTERN})\\s*(?:minutes?|min)\\b|\\s+et\\s+(${NUMBER_PATTERN})\\s*(?:minutes?|min)\\b|\\s+et\\s+(demie?|quart)\\b|\\b)`, 'i'),
      build: (m, n) => {
        const hours = readNumber(m[1]);
        const extra = m[2] ?? m[3];
        const minutes = extra ? readNumber(extra) : m[4] ? (m[4] === 'quart' ? 15 : 30) : 0;
        if (hours === null || minutes === null || minutes > 59) return null;
        return inMinutes(n, hours * 60 + minutes);
      },
    },
    {
      regex: new RegExp(`\\bdans\\s+(${NUMBER_PATTERN})\\s*(?:minutes?|min)\\b`, 'i'),
      build: (m, n) => {
        const minutes = readNumber(m[1]);
        return minutes === null ? null : inMinutes(n, minutes);
      },
    },
    // Les moments vagues donnent une vraie heure, visible avant validation.
    // Une heure écrite ensuite prend toujours le pas sur l'heure proposée.
    {
      regex: new RegExp(`\\b(apr[eè]s[-\\s]?demain|demain|aujourd['’]hui)\\s+(?:(?:au|en)\\s+|(?:dans\\s+)?l['’])?${DAY_PART_PATTERN}${TIME}\\b`, 'i'),
      build: (m, n) => {
        const offset = m[1] === 'demain' ? 1 : m[1].startsWith('aujourd') ? 0 : 2;
        return buildDayPart(n, m[2], offset, m[3], m[4]);
      },
    },
    {
      regex: new RegExp(`\\b(?:ce\\s+(matin|soir)|cet(?:te)?\\s+(apr[eè]s[-\\s]?midi))${TIME}\\b`, 'i'),
      build: (m, n) => buildDayPart(n, m[1] ?? m[2], undefined, m[3], m[4]),
    },
    // "[le] 15 avril [à] [12[h[30]]]" — le « le » est facultatif : on écrit
    // aussi bien « rdv 3 août » que « rdv le 3 août ».
    {
      regex: new RegExp(`\\b(?:le\\s+)?(\\d{1,2})\\s+${MONTH_PATTERN}${TIME}\\b`, 'i'),
      build: (m, n) => {
        const day = parseInt(m[1], 10);
        const month = MONTHS[m[2].toLowerCase()];
        if (month === undefined) return null;
        return buildDayMonth(day, month, m[3], m[4], n);
      },
    },
    // "après-demain [à] [12[h[30]]]" — accent et tiret facultatifs
    {
      regex: new RegExp(`\\bapr[eè]s[-\\s]?demain${TIME}\\b`, 'i'),
      build: (m, n) => {
        const d = startOfDay(n);
        d.setDate(d.getDate() + 2);
        return buildTime(d, m[1], m[2]);
      },
    },
    // "demain [à] [12[h[30]]]"
    {
      regex: new RegExp(`\\bdemain${TIME}\\b`, 'i'),
      build: (m, n) => {
        const d = startOfDay(n);
        d.setDate(d.getDate() + 1);
        return buildTime(d, m[1], m[2]);
      },
    },
    // "lundi prochain [à] [10[h]]"
    {
      regex: new RegExp(`\\b${WEEKDAY_PATTERN}\\s+prochain${TIME}\\b`, 'i'),
      build: (m, n) => {
        const wd = WEEKDAYS[m[1].toLowerCase()];
        if (wd === undefined) return null;
        const d = nextWeekday(wd, n, true);
        return buildTime(d, m[2], m[3]);
      },
    },
    // "lundi [à] [10[h]]"
    {
      regex: new RegExp(`\\b${WEEKDAY_PATTERN}${TIME}\\b`, 'i'),
      build: (m, n) => {
        const wd = WEEKDAYS[m[1].toLowerCase()];
        if (wd === undefined) return null;
        const d = nextWeekday(wd, n, false);
        return buildTime(d, m[2], m[3]);
      },
    },
    // "dans 3 jours"
    {
      regex: /\bdans\s+(\d+)\s+jours?\b/i,
      build: (m, n) => {
        const x = parseInt(m[1], 10);
        const d = startOfDay(n);
        d.setDate(d.getDate() + x);
        return { date: d, hasTime: false };
      },
    },
    // "dans 2 semaines"
    {
      regex: /\bdans\s+(\d+)\s+semaines?\b/i,
      build: (m, n) => {
        const x = parseInt(m[1], 10);
        const d = startOfDay(n);
        d.setDate(d.getDate() + x * 7);
        return { date: d, hasTime: false };
      },
    },
    // "à 14h30" / "a 14h" — le « h » (ou « : ») est exigé ici, sinon « a 3 »
    // dans « acheter a 3 euros » serait pris pour une heure.
    // Pas de \b avant « à » : ce n'est pas un caractère de mot.
    {
      regex: /(?:^|\s)[aà]\s+(\d+)[h:](\d*)\b/i,
      build: (m, n) => buildTimeToday(n, m[1], m[2]),
    },
    // "à 14" — heure nue tolérée uniquement avec le « à » accentué, qui est
    // une intention plus explicite.
    {
      regex: /(?:^|\s)à\s+(\d{1,2})\b/i,
      build: (m, n) => buildTimeToday(n, m[1], undefined),
    },
    // "14h30" / "14h" / "14:30" — sans « à », le séparateur horaire est requis.
    {
      regex: /\b(\d+)[h:](\d*)\b/i,
      build: (m, n) => buildTimeToday(n, m[1], m[2]),
    },
  ];

  for (const { regex, build } of builders) {
    const match = findMatch(lowered, regex, build, now);
    if (match) {
      if (!match.date) return { cleanTitle: original.trim(), detectedDate: null, hasTime: false };
      return { cleanTitle: strip(original, match), detectedDate: match.date, hasTime: match.hasTime };
    }
  }

  return { cleanTitle: original.trim(), detectedDate: null, hasTime: false };
}
