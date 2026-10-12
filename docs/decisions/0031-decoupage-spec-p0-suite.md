# 0031 — Décision du Tech Lead : découpage de la spécification des exécutions réelles de P0

Statut : décision déléguée (périmètre technique d'une tâche), à lister dans la note de version suivante, rubrique « Décisions prises par le studio » ; définitive sans veto de Samuel dans les 2 jours qui suivent cette publication · Date : 2026-10-12 · Décideur : Tech Lead (délégation « Qui décide quoi » de `docs/CONTEXT.md` ; règle du cycle de Samuel : « Au plus deux corrections par tâche ; au-delà, tu décides avec le Tech Lead : troisième tentative ou découpage »), consignée par IA-recherche dans #172 ; l'approbation de #172 par le Tech Lead vaut confirmation · Ticket #170

Numérotation : 0029 est réservée par #164 (chaîne MVP ouverte avant G0, PR non fusionnée à cette date), 0030 est prise par #149. 0031 est le prochain numéro libre.

## Contexte
La décision 0030 (§ 3) renvoyait à une spécification suivante les exécutions réelles de P0 : P0a2, P0b2, P0a3, A5, les clients réels, les plafonds et la grille G0. Cette spécification (#172, `specs/P0-suite-executions-reelles.md`) a reçu deux revues comptées. La revue consolidée du head `2639d52` relevait 6 bloquants, dont 5 tardifs. Quatre d'entre eux (bloquants 1 à 4) portent sur l'exploitation réelle : intégration Neon–Vercel sur toutes les préversions, branches Neon enfants, secret de purge et rôle limité à la suppression, barrière d'accès hors de la protection Vercel. C'est le même terrain qui avait fait découper #149.

## Décision
1. **Découpage, pas de troisième tentative sur l'ensemble.** #172 garde le cadre (objectif, citation de Samuel sur Q257, ce qui est en place, feuille de route) et ne spécifie en détail que **P0r1** : les clients réels (modèles, Places, Routes, lecture des pages), sans aucun appel déclenchable.
2. **Bloquants 5 et 6 réglés dans P0r1.** P0r1 livre lui-même les modules étroits `@/server/env/ai` et `@/server/env/grounding`, autonomes, sans dépendre de `src/server/env.ts` (B3). Il définit aussi le port de consommation `@/server/usage`, avec une implémentation en mémoire. Aucune écriture en base n'a lieu depuis `src/ai` ni `src/grounding`, et la migration vers `usage_ledger` est nommée.
3. **Spécification suivante** (`specs/P0-suite-2.md`, nom proposé ; ticket, PR et place dans le backlog fixés par le CEO) : P0r2, P0r3, P0r4, P0a2, P0b2, P0a3, valeurs des plafonds, grille G0, P0-Q6. Les bloquants 1 à 4 de la revue du head `2639d52` y sont des exigences d'entrée, repris mot pour mot dans la section « Renvoyé à la spécification suivante » de #172. La garde complète du mode réel y dépend de `src/server/env.ts` (B3), dépendance déclarée.
4. **Revue de la version réduite.** Si elle échoue encore, la suite remonte au CEO.
5. **Test de #149 conservé, avec exceptions nominatives.** Le test de P0a1 « aucun client réel ni accès réseau dans le code de P0a1 » (`specs/P0-prototype-recherche.md`) n'est **pas remplacé** : sa liste d'autorisation des imports et sa liste d'interdits restent en vigueur pour `src/ai`, `src/research` et `src/grounding`. Seules sont ajoutées des exceptions nominatives, une par fichier de capacité réseau :
   - `ai`, `@openrouter/ai-sdk-provider` et l'hôte `openrouter.ai` dans `src/ai/openrouter-client.ts` ;
   - le `fetch` global et les hôtes `places.googleapis.com` et `routes.googleapis.com` dans `src/grounding/places-client.ts` et `src/grounding/routes-client.ts` ;
   - `undici` et `node:zlib` dans `src/research/undici-transport.ts` ;
   - `process.env` dans `src/server/env/ai.ts` et `src/server/env/grounding.ts`.
   Aucun autre interdit de #149 n'est levé. S'y ajoute le test `p0: aucun client réel atteignable depuis un point d'entrée` (défini par capacité réseau, sur la fermeture transitive du graphe d'imports de tout le dépôt). Restent **inchangés** : `--reel` fermé (`real_mode_unavailable`, testé) ; `node:net` dans le seul `ip-guard.ts`, sous la seule forme `import { BlockList, isIP } from "node:net"` ; `ip-guard.ts` importé seulement par le module de lecture des pages.
6. **Amendement de 0017 § 3.3.** La règle « hors de `src/server`, seul `@/server/actions/*` est importable » admet une exception : `src/ai` peut importer `@/server/env/ai` et `@/server/usage` ; `src/grounding` peut importer `@/server/env/grounding` et `@/server/usage` (le port seulement, jamais une implémentation). Aucun autre dossier n'en bénéficie ; la règle de lint et ses tests sont mis à jour par P0r1. Les deux modules d'environnement relèvent du périmètre de B3, qui les reprend sans les changer.

## Conséquences
- P0r1 démarre à la fusion de #172 et de P0a1, sans B1 ni B3.
- Le verrou des exécutions réelles porte sur toutes les exigences d'entrée de #172 : 1 à 3 vérifiées dans la PR de P0r2 avant toute écriture de position, 4 avant P0r3 et P0r4, 5 avant toute mise en public. Chaque vérification exige un verdict explicite du rôle Sécurité et l'accord écrit de Samuel. La fusion de la spécification suivante ne suffit pas.
- Mesure provisoire proposée à Samuel (P0-Q19) et refusée le 2026-10-12 : risques acceptés consignés par le CEO dans la décision 0034. L'exigence 1 n'est pas assouplie : elle reste vérifiée avant la première écriture de position.
- Les questions déjà posées à Samuel (P0-Q15 à P0-Q18) sont reprises par la spécification suivante.

## Quand revoir cette décision
À l'ouverture de la spécification suivante.
