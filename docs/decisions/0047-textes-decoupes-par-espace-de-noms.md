# 0047 — Textes d'interface découpés par espace de noms (budget du JavaScript initial, R15)

Statut : décision déléguée (architecture, outillage : « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel dans les 2 jours qui suivent cette publication · Date : 2026-10-13 · Décideur : Tech Lead · Ticket #259 (F8b, `specs/F8b*`), PR de F8b

Numérotation (vérifiée le 2026-10-13) : `main` va de 0001 à 0045 ; la PR #266 ajoute 0046 ; aucune autre PR ouverte ni branche `claude/…` n'ajoute de fichier sous `docs/decisions/`. Cette PR ajoute `0047`.

## Contexte
F8b n'atteignait pas un `pnpm verify` vert : le test `budget: JavaScript initial par route` mesurait `R15` (`/voyages/mock_trip_edimbourg/aujourdhui`) à **200 547 octets** gzip pour un seuil strict de 200 000 (handover front § 14, 0016 § 3.1 règle 5, 0022 § 4). `main` était déjà à 199 867. F8b ajoute environ 950 octets de JavaScript partagé, dont environ 590 viennent des textes que sa spécification impose.

Cause vérifiée sur le build de production (Next.js 16.4, Turbopack) : `src/i18n/index.ts` exportait `messages = fr`, le fichier `fr.json` entier (39,7 ko, environ 11 ko gzip). Tout composant client qui lisait un texte embarquait donc **tous** les textes de l'application, création, développement et paiement compris, dans un bloc partagé par toutes les pages. Chaque texte ajouté pour un écran pesait sur le budget de tous les autres.

Options écartées :
- **relever le seuil** : le seuil ne se relève pas sans décision écrite (0016 § 3.1), et le relever ne traite pas la cause ; refusé ;
- **`knownExceedance` sur R15** : réservé à un dépassement accepté et suivi ; ici la cause se corrige ; refusé ;
- **ré-exporter les espaces de noms depuis `@/i18n` sans toucher aux lecteurs** (`export * as messages from "./messages"`) : essayé, Turbopack n'élague pas à travers ce ré-export (R15 à 200 483, 64 octets gagnés) ; refusé.

## Décision
1. **Un fichier JSON par espace de noms** : `fr.json` est remplacé par `src/i18n/fr/<espace>.json` (`produit`, `accueil`, `ligne`, `carte`, `dev`, `presentation`, `sejour`, `voyage`, `mesVoyages`, `debloquer`, `etats`, `creation`, `connexion`, `revision`, `partage`), contenu repris tel quel, clé pour clé. Les espaces de noms existants correspondent déjà aux écrans ou groupes d'écrans ; aucune clé n'est renommée. Le handover § 10 (« toutes les chaînes passent par les fichiers de textes français ») ne change pas sur le fond ; ses mentions de `fr.json` désignent désormais `src/i18n/fr/` (handover mis à jour dans cette PR). Les commentaires du code qui disent « fr.json » désignent cet ensemble ; ils ne sont pas réécrits un par un.
2. **Lecture** : `import * as messages from "@/i18n/messages"`, puis `messages.<espace>.<clé>` par un chemin statique. `src/i18n/messages.ts` ré-exporte chaque fichier sous son nom ; c'est la seule entrée vers les textes. Turbopack n'embarque alors dans une page que les fichiers d'espace de noms que ses modules lisent.
3. **`@/i18n`** n'exporte plus que `format` et n'importe aucun texte : importer `format` n'embarque rien. Le type `Messages`, sans lecteur, disparaît.
4. **Interdit hors des tests** : passer, parcourir ou indexer `messages` en entier (`f(messages)`, `messages[clé]`, `Object.keys(messages)`) ; cela réembarquerait tous les textes. Les tests peuvent le faire (Vitest ne mesure rien).
5. **Ajouter un espace de noms** : un fichier dans `src/i18n/fr/` et une ligne dans `messages.ts`. Un espace de noms trop gros pour une page qui n'en lit qu'une partie se découpe à son tour de la même manière ; la granularité est l'espace de noms, jamais la clé.
6. **Garde** : `tests/unit/i18n-decoupage.test.ts` vérifie que les fichiers de `src/i18n/fr/` et les exports de `messages.ts` coïncident, que `@/i18n` n'importe rien, qu'aucun fichier de `src/` hors tests n'utilise `messages` autrement que par `messages.<espace>`, et qu'aucun ne lit un fichier de textes hors de `messages.ts`. Le test de budget reste la garde finale.

## Mesures (build de production, Google bloqué, même machine)
| Route | Avant (F8b, `2aa6cce`) | Après |
|---|---|---|
| R15 `/voyages/…/aujourdhui` (seuil) | 200 547 | **195 332** |
| R11 `/voyages/…` (seuil) | 195 202 | 191 094 |
| R12 et Journée de T4 (seuil) | — | 190 662 |
| R6 présentation (seuil) | — | 181 414 |
| RP, RPJ vue partagée (seuil) | — | 176 158 |

R15 passe sous le seuil avec environ 4,7 ko de marge ; les 19 mesures du test de budget passent. Le seuil de 200 000 octets ne change pas.

## Références visuelles
Régénérées sur la CI par `visual-update` (commit `1b5793d`, décision 0004) : 8 nouvelles références de F8b (connexion, logement) et 5 références modifiées (`accueil`, `brief-recit-bandeau-erreur`, `dev-composants-jours-focus-complet`, `revision-deplacer-jours`, `revision-deplacer-points`). Le découpage des textes ne change aucun texte : la revue compare ces 5 captures à celles de `main` et signale tout écart qui ne vient pas de l'entrée « Créer un voyage » de l'accueil.

## Ce que cette décision ne tranche pas
Rien qui engage de l'argent, un compte externe ou des données personnelles. Aucune règle de Ligne ni aucun texte ne change.
