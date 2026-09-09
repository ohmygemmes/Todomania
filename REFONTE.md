# Refonte iDayal

La refonte est intégrée à l’application React existante. Le nom, le logo SVG et les icônes d’installation sont conservés à l’identique. Le document de présentation fourni pour la refonte reste intact.

## Direction

Fond papier, texte encre, bleu de marque et accents sobres. La date reste le titre d’Aujourd’hui. La liste ne comporte aucune jauge de progression de la journée. Sur ordinateur, une colonne de navigation et un aperçu de la prochaine carte utilisent la largeur disponible ; sur téléphone, quatre onglets et la saisie restent en bas.

Les cartes ont une pile visible, un titre centré en Manrope (police embarquée), adapté au contenu, des étapes et une note dans une zone défilante. Les actions principales restent séparées des outils secondaires. Les animations respectent la préférence de réduction des mouvements.

## Parcours

- Saisie naturelle avec aperçu de la date reconnue ; Aujourd’hui, Demain, calendrier, heures fixes, décalages et heure précise.
- Accès à la carte depuis une ligne de la journée.
- Reprogrammation identique au doigt, au bouton ou avec la flèche gauche. Choisir une heure puis un jour ; la date personnalisée se valide explicitement avec Planifier.
- Réglages, notes, échéances futures et thèmes clair/sombre harmonisés.
- Navigation clavier contenue dans les fenêtres ; Échap ferme et restitue le focus.
- Les champs et boutons d’action ne déclenchent pas de balayage. Un toucher sur le titre édite, un glissement sur le même titre déplace la carte. La zone de notes reste isolée des gestes quand une carte remonte en tête.

Une anomalie préexistante révélée par les tests a été corrigée : la création de la note conservée se faisait dans une fonction de mise à jour React rejouable en StrictMode. Elle se fait maintenant une seule fois dans l’action de validation. L’annulation restaure également la note d’origine si elle avait été écartée.

## Ajustements après essai

- Une ancienne heure dépassée ouvre la reprogrammation sur sa prochaine occurrence : mercredi à 23 h 55, une tâche de midi propose jeudi à midi. Aujourd’hui à cette heure est indisponible ; une date personnalisée passée ne se valide pas. Un contrôle au clic couvre aussi une heure qui expire pendant que la feuille reste ouverte.
- Le raccourci « Dans 1 heure » traverse correctement minuit.
- Le glissement utilise les événements de pointeur pour le tactile et la souris, avec capture du pointeur, seuil relatif à la largeur de la carte et annulation d’un mouvement vertical. Les zones défilantes intérieures déclarent aussi leur politique tactile.
- Les champs et boutons gardent leurs gestes habituels. Le glissement dans une note ne déplace pas la carte ; la suppression par balayage des lignes est conservée.
- Le bouton « Voir tout le paquet » occupe toute la largeur, avec 44 px de hauteur minimum et un texte de 14 px. Cartes garde sa place parmi les quatre onglets et se distingue par une icône plus présente. Seul l’onglet sélectionné porte un fond bleu plein.
- Papier clair, tranches bleutées, ombres superposées et action Plus tard abricot. Le kaki est retiré ; le nom et le logo restent inchangés. Les variantes sombres reprennent ces accents.

## Ajouts validés le 10 septembre

- Titres centrés et modifiables par clic ou toucher dans la liste comme sur la carte. Entrée enregistre, Échap annule, un titre vide ne remplace pas le précédent. Le glissement horizontal garde son sens actuel : la gauche supprime une ligne mais reprogramme une carte.
- Épingles et libellés Épingler / Désépingler ; état Épinglée lisible, sans confusion avec la carte simplement consultée.
- En-tête Cartes compact ; chrono replié au repos et visible lorsqu’il est utilisé.
- Français naturel : « dans vingt minutes », « dans deux heures », « demain matin » (9 h), « cet après-midi » (14 h), « ce soir » (18 h). L’heure exacte apparaît avant l’ajout ; une heure explicite prime. Les contrôles de reprogrammation existants sont conservés.
- Recherche locale des titres, étapes et notes, insensible aux accents et à la casse, ouverte par la loupe ou Ctrl/Cmd+K. Un résultat s’ouvre sans changer sa date, une note retrouvée reste modifiable.
- Consultation des tâches futures depuis le paquet, Plus tard ou la recherche. Le bouton explicite « Faire aujourd’hui » déplace la tâche ; ouvrir ou fermer ne la déplace jamais.
- Répétition quotidienne, jours ouvrés, hebdomadaire et mensuelle, avec une section **Récurrentes** dans Aujourd’hui et Plus tard. Depuis une carte : menu Répéter ; depuis la saisie : « Arroser les plantes chaque dimanche à 9h ». Une seule occurrence reste active, la prochaine conserve les étapes et la note et réinitialise les coches. Les jours de semaine et les fins de mois sont conservés. Annuler retire la prochaine occurrence et restaure la précédente.

### Synchronisation des répétitions

Les règles sont des champs optionnels des tâches dans le JSON existant : aucune migration de base. Le transport `cloudSync.ts` et les décisions `syncDecision.ts` ne changent pas. `useCloudSync.ts` reçoit un ajustement ciblé : une adoption distante identique reste silencieuse, mais la création locale d’une occurrence suivante est bien renvoyée. Une complétion ou un décochage reçu de Cockpit est réconcilié sans doublon.

La génération de la prochaine occurrence vit dans iDayal, pas dans un automate serveur : il faut qu’iDayal reçoive la complétion. Si Cockpit coche puis supprime la seule occurrence d’une série avant qu’iDayal la reçoive, la règle disparaît avec elle ; ce cas nécessite une évolution côté Cockpit/serveur. Aucun code Cockpit ni serveur n’a été modifié.

## Ouvrir

Depuis ce dossier :

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

Ouvrir http://127.0.0.1:5173/ . Les captures des parcours sont dans `outputs/apercus.html`. Leurs tâches sont des données fictives d’un navigateur de test isolé, jamais injectées dans l’application.

## Vérification

- `npm run build` : TypeScript et production Vite.
- `npm test` : 248 tests de logique : 129 de français naturel, 8 de synchronisation, 20 de raccourcis, 31 de minuterie, 12 d’ordre du paquet, 14 de reprogrammation et 34 de récurrence.
- `scripts/verify-refinements.mjs` : 16 contrôles ciblés, dont le cas exact du mercredi 9 septembre à 23 h 55, le passage à minuit, les glissements souris/tactiles, les mouvements annulés et la protection des notes. Rapport : `outputs/verification-refinements.json`.
- `scripts/verify-redesign.mjs` : 18 contrôles de parcours réels dans Chromium, saisie, raccourcis, étapes, notes, annulation, reprogrammation, balayages tactiles, minuteries, thème, persistance et absence d’erreur JavaScript.
- `scripts/verify-editing.mjs` : 21 vérifications souris/tactile des titres, épingles, chronomètre, défilement vertical et protection des éditeurs.
- `scripts/verify-blue-features.mjs` : 12 contrôles des nouveaux parcours, recherche et récurrences, avec captures 11 à 16. Rapport : `outputs/verification-blue-features.json`.
- `scripts/verify-recurrence-store.mjs` : 6 contrôles des actions du store sous React.StrictMode, complétion, annulation, suppression de répétition, import/export.
- `scripts/verify-recurrence-sync.mjs` : 10 contrôles des vrais hooks avec un transport cloud remplacé en mémoire, sans aucune requête externe. Protection d’un appareil vierge, prochaine occurrence après action Cockpit, pas de boucle, décochage et arrêt d’une série. Rapport : `outputs/verification-recurrence-sync.json`.
- Formats vérifiés : 320 × 568, 390 × 844, 768 × 1024 et 1440 × 1000 ; absence de débordement horizontal et actions accessibles au-dessus de la saisie.
- Chaque script ouvre un contexte de navigateur vierge et se ferme après ses contrôles. Rapport : `outputs/verification.json`.

Pour rejouer le contrôle navigateur sans ajouter une dépendance à l’application, installer Playwright dans un dossier temporaire puis fournir le chemin du module et celui de Chrome :

```sh
npm install --prefix /tmp/idayal-ui-qa playwright --no-audit --no-fund
PLAYWRIGHT_MODULE=/tmp/idayal-ui-qa/node_modules/playwright/index.mjs \
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node scripts/verify-redesign.mjs
```

La même commande avec `scripts/verify-refinements.mjs` rejoue les vérifications des ajustements.

Le serveur Vite doit tourner. `APP_URL` permet de changer son adresse. Ce contrôle émule les tailles d’écran et les événements tactiles ; il ne remplace pas une validation Safari sur iPhone ou dans Capacitor. La publication web utilise le workflow GitHub Pages du dépôt. La compilation native iOS et un échange avec le vrai compte Cockpit ne font pas partie de ces tests. Les tests cloud utilisent exclusivement des données fictives et un transport simulé.

## Retour à la version précédente

Le commit avant refonte est `e77eefae3931016d425a488743d1825c4143226f`, conservé par la branche `backup/pre-redesign-2026-09-10`.
