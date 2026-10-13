# 0048 — Décisions du Tech Lead pour la suite de B5 (configuration serveur, formule de classement, durées estimées) ; amende 0045

Statut : décision déléguée (architecture, outillage, tests : « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel dans les 2 jours qui suivent cette publication · Date : 2026-10-13 · Rédaction : CEO (commit `[ceo]`), comme 0045 · Décideur : Tech Lead · Ticket #271 · Spécification `specs/B5-moteur-sans-ia.md` · Questions : question 1 de #268 (B5a, fusionnée) ; écarts 1 et 3, questions 1 à 3 de #270 (B5b, ouverte) · **Amende la décision 0045** (§ 1 « Amendement de 0032 », dernier point ; § 2.2 ; § 4.1, § 4.4 et « Ce que B5a doit tester » du § 4 ; § 6.2 ; « Conséquences »), sans la réécrire

Numérotation (vérifiée le 2026-10-13) : `main` va de 0001 à 0045 ; les PR ouvertes #266 (`0046`) et #269 (`0047`) prennent les deux numéros suivants ; aucune autre PR ouverte (#243, #256, #270) n'ajoute de fichier sous `docs/decisions/`. Cette PR ajoute `0048`.

## Contexte
B5a (#268) a livré `src/server/config/moteur.json` et sa lecture par P0, mais pas le module serveur `src/server/config/moteur.ts` demandé par 0045 § 4.2 : le test du graphe de l'application l'interdit. B5b (#270) a fait entrer la formule de classement par une entrée séparée, et ne peut pas dire qu'une durée de trajet est estimée. Les trois points relèvent du Tech Lead.

## État vérifié sur `main` (`a4b5a29`) et sur la branche de #270
- Le test « le graphe de l'application n'importe ni @/ai, @/research, @/grounding, @/domain ni scripts/ » (`tests/unit/p0/imports.test.ts:910-921`) parcourt le graphe **transitif** de chaque fichier de `src` hors `DOSSIERS_P0` (l. 482) et hors `src/contracts`, `src/server` compris, et refuse tout chemin commençant par `src/domain/` (l. 916).
- Il ne vise donc pas seulement `src/server/config/moteur.ts` : **tout appel du moteur depuis le serveur** est refusé (`generer` en B8 et B9, `applyPatch` en B11), et, par transitivité, toute page ou tout composant qui importe une action serveur (`src/server/actions/`, `"use server"`) qui appelle le moteur. 0045 § 6.2 prévoit pourtant que « le serveur (`applyPatch`, aperçus de révision) importe » `verrous.ts`, tout en écrivant « aucune exception au graphe de l'application » : les deux phrases se contredisent dès B8.
- `src/server/**` porte `import "server-only"` sans exception (`eslint.config.mjs`, bloc B1, décision 0006) ; `src/server/actions/` est en `"use server"`. Les fichiers d'interface ne peuvent importer de `src/server` que les actions (`SERVER_PATTERN`, blocs F9a et F11 de `eslint.config.mjs`). Aucune règle ESLint ne refuse `@/domain` dans `src/server`.
- Le graphe de `src/domain` est fermé : `@/contracts`, `zod` et `src/domain` seulement (règle ESLint de 0045 § 3 et ligne `src/domain` de `imports.test.ts`).
- `src/domain/configuration.ts` (`ConfigurationMoteurSchema`) n'importe que `zod` et `@/contracts`. `vitest.config` remplace `server-only` par `tests/stubs/server-only.ts` : un module de `src/server` est testable (`src/server/config/offer.test.ts`).
- #270 : `EntreeMoteur.classement: { formule: ConfigClassement; ageSourceMaxJours: number }` (`src/domain/entrees.ts:104`), validée par `ConfigClassementSchema` (`src/domain/classement.ts:27`) ; `ConfigurationMoteur` n'a pas de clé de classement. `Segment.estimated` est écrit `false` en dur (`src/domain/planification.ts:243`, `269`, `298`).
- `Segment.estimated` est stocké (handover `backend.md:316` : « vrai quand la durée est une estimation du moteur » ; l. 326 : seuls `mode` et `estimated` sont dans l'instantané). B5-PO-6 : « `Segment.estimated` reprend ce que répond l'interface de trajets […] l'estimation à partir des coordonnées (0011 point 5) relève de B8, qui la fournit à travers l'interface de trajets. » L'interface `duree` de 0045 § 2.2 ne répond que `number | "inconnu"`.

## Décision

### 1. Question 1 de #268 — Le serveur appelle le moteur : frontière nommée « src/domain n'est atteint que par src/server »
1. **Option retenue : ni (a) ni (b), une frontière.** Dans le graphe de l'application, un chemin vers `src/domain/` est admis **seulement s'il passe par un module de `src/server/`**. Concrètement :
   - un fichier de `src/server/**` peut importer `@/domain/*` (configuration, `generer`, `replanifierJour`, `verrous.ts`, refus typés) ;
   - un fichier d'interface (`src/app`, `src/components`, `src/features`, `src/lib`, `src/adapters`, `src/i18n`, etc.) n'importe jamais `@/domain` directement, ni par un module qui n'est pas sous `src/server/` ; il peut importer une action de `src/server/actions/` qui, elle, appelle le moteur ;
   - le reste du test ne change pas : `@/ai`, `@/research`, `@/grounding`, `scripts/` et `src/prototype` (sauf `programme-reduit.ts`) restent refusés **sur tout le graphe**, `src/server` compris.
2. **Raisons.**
   - Le moteur ne sert à rien s'il n'est pas appelé par le serveur : « l'agent cherche, l'ancrage vérifie, le moteur planifie » place l'orchestration (relectures, puis appel du moteur, puis écriture de la version) dans `src/server` (handover `backend.md:832`, étape e ; 0016 § 4.2, l. 116, où le serveur importe la fonction de R3).
   - (b) **rejetée** : déplacer `ConfigurationMoteurSchema` dans `src/contracts` ne règle que la configuration ; `generer` et `verrous.ts` resteraient inatteignables, et la question reviendrait à B8. Le schéma est un type d'entrée interne du moteur (0045 § 4.1), pas une donnée échangée entre l'interface, le serveur et le stockage : il n'a pas sa place dans les contrats.
   - (a) **rejetée dans sa forme étroite** : une exception pour le seul fichier `moteur.ts` laisserait B8, B9 et B11 bloqués et appellerait une exception par fichier.
   - Ce que la règle protégeait reste protégé : `src/domain` n'atteint jamais le navigateur. Les modules de `src/server` portent `server-only` (le build casse s'ils entrent dans un paquet client) et les actions sont en `"use server"` (le client n'en reçoit qu'une référence). Le graphe de `src/domain` est fermé (contracts et zod), donc ouvrir `src/server → src/domain` n'ouvre rien d'autre par transitivité. 0045 § 6 (« l'interface n'importe jamais `@/domain` ») tient toujours.
3. **Emplacement du fichier** : `src/server/config/moteur.ts`, comme 0045 § 4.2, sans changement. Il commence par `import "server-only"`, importe `ConfigurationMoteurSchema` de `@/domain/configuration` et `./moteur.json`, et exporte la configuration validée au chargement (`CONFIGURATION_MOTEUR`, nom libre), sur le modèle de `offer.ts`. Le schéma **reste** dans `src/domain/configuration.ts`. `scripts/p0/fichiers.ts` ne change pas (il lit le JSON, 0045 § 4.2).
4. **Ticket** : **B5c** (ajustement de périmètre, 0041 point 4). B5c ajoute `src/server/config/moteur.ts` et son test, et modifie le test du graphe de l'application dans `tests/unit/p0/imports.test.ts`. B8, B9 et B11 dépendent déjà de B5c ; ils sont débloqués à sa fusion. B5b n'est pas touchée.
5. **Ce que B5c doit tester.**
   - Le critère resté ouvert de 0045 § 4 : `configuration du moteur: le module serveur et scripts/p0 donnent le même objet validé` (égalité profonde entre l'export de `moteur.ts` et la lecture de `scripts/p0/fichiers.ts`).
   - Le test du graphe de l'application, réécrit en deux parties, sur les fichiers réels :
     - parcours **qui ne descend pas dans `src/server/`** : `src/domain/` y reste refusé pour tout fichier de l'application hors `src/server` ;
     - parcours complet : `@/ai`, `@/research`, `@/grounding`, `scripts/` et `src/prototype` (sauf `programme-reduit.ts`) refusés pour tout fichier, `src/server` compris.
   - Cas fabriqués (comme les « tests négatifs » existants du même fichier) : refusé, `src/features/x.ts` → `@/domain/configuration` ; refusé, `src/lib/x.ts` → `src/lib/y.ts` → `@/domain/generation` ; admis, `src/server/config/moteur.ts` → `@/domain/configuration` ; admis, `src/features/x.tsx` → `@/server/actions/y` → `@/domain/generation` ; refusé, `src/server/x.ts` → `@/research/agent`.
   - Le titre du test nomme la frontière (par exemple « … @/domain seulement par src/server … ») et cite cette décision.

### 2. Formule de classement — choix de B5b confirmé ; 0045 § 4.1 corrigé
1. **Confirmé** : jusqu'à B9, la formule entre dans le moteur par `EntreeMoteur.classement` (#270), validée par `ConfigClassementSchema` de `src/domain` ; ses valeurs restent dans `prototype/config/classement.json` (ia-recherche, 0032 A2). `ConfigurationMoteurSchema` ne reçoit **aucune** clé de classement, même facultative : une clé facultative ouvrirait une seconde source possible, ce que 0045 § 4.4 interdit (« une seule source à tout moment »).
2. **0045 § 4.1 est corrigé** : la phrase « La formule de classement y est ajoutée en B5b (§ 1.4) » devient « La formule de classement y est ajoutée en B9, selon le § 4.4 ». Le § 4.4 fait foi.
3. **En B9** (premier appel de production), dans une seule PR : clé obligatoire `classement` dans `ConfigurationMoteurSchema` (schéma `ConfigClassementSchema` composé), valeurs déplacées de `classement.json` vers `moteur.json`, `classement.json` retiré, `scripts/p0/fichiers.ts` lit la formule dans `moteur.json`, et `EntreeMoteur.classement.formule` disparaît au profit de `configuration.classement` (un seul chemin d'entrée). Les valeurs de cette clé restent à ia-recherche (revue du rôle `ia`). `ageSourceMaxJours` n'est pas une valeur de la formule : il reste une entrée du moteur, sa source n'est pas tranchée ici.
4. **Effet sur #270** : aucun changement demandé.

### 3. Interface `duree` et `Segment.estimated` — interface étendue, en B5c
1. **L'interface est étendue.** B5-PO-6 demande que `Segment.estimated` reprenne la réponse de l'interface, et que l'estimation par coordonnées vienne de B8 à travers elle : sans le champ, la règle est inapplicable et `estimated` ment dès B8. Nouvelle forme de 0045 § 2.2 :
   ```ts
   duree(depuis: Point, vers: Point, mode: "walk" | "transit" | "car"): { minutes: number; estimee: boolean } | Inconnu;
   ```
   Rejeté : une seconde fonction `estimee(depuis, vers, mode)` (deux appels à tenir cohérents pour une même réponse).
2. **Règles du moteur** :
   - le mode le plus rapide se choisit sur `minutes` seules, départage inchangé (B5-PO-6) ; `estimee` ne change ni le choix du mode, ni le classement, ni R5 (une durée estimée est une durée connue ; seul `"inconnu"` rend un trajet non planifiable) ;
   - `Segment.estimated` = `estimee` du mode retenu ; `Change[segment].estimated` (calculé, `backend.md:440`) se lit de la même façon ;
   - le moteur n'estime jamais lui-même (B5-PO-6 inchangé) ; `estimee` n'apparaît ni dans le rapport ni dans une sortie d'écriture autrement que par `Segment.estimated`, déjà stocké par contrat (le booléen est une donnée maison, pas une valeur Google).
   - Faut-il préférer un mode mesuré à un mode estimé plus rapide ? Détail fonctionnel, non tranché ici (Product Owner, si la question se pose en B8).
3. **Ticket** : **B5c** (ajustement de périmètre, 0041 point 4). B5c modifie `src/domain/relectures.ts` (`duree`, `trajetLePlusRapide`), les écritures de `estimated` du planificateur et les doubles des tests (B5a, B5b et `scripts/p0/vers-moteur.ts`, dont les doubles répondent `estimee: false`, ce qui garde la sortie de `pnpm p0` égale). B8 remplit `estimee` ; il ne change pas l'interface.
4. **Ce que B5c doit tester.** `moteur: durée estimée reprise dans le trajet` : un double qui répond `estimee: true` pour le mode retenu donne `Segment.estimated: true` dans l'instantané ; `false` sinon ; un mode estimé plus rapide qu'un mode mesuré est retenu (choix sur `minutes`) ; le rapport sérialisé ne contient pas `estimee`. Sortie simulée de `pnpm p0` égale avant et après.
5. **Effet sur #270** : aucun. L'écart 3 de #270 (`estimated` toujours `false`) est accepté pour B5b ; B5c le lève.

## Amendements de 0045
- § 1, « Amendement de 0032 », dernier point, et « Conséquences », dernier point : « Aucune exception au graphe de l'application n'est accordée » devient « Le graphe de l'application admet `src/domain` seulement à travers `src/server` (0048 § 1) ; l'interface n'importe jamais `@/domain` ».
- § 2.2 : `duree` répond `{ minutes, estimee } | "inconnu"` (0048 § 3), à partir de B5c.
- § 4.1 : formule de classement ajoutée à la configuration en B9, pas en B5b (0048 § 2).
- § 4, « Ce que B5a doit tester » : le cas « le module serveur et `scripts/p0` donnent le même objet validé » passe à B5c (0048 § 1.5).
- § 6.2 : « Aucune exception au graphe de l'application » se lit avec 0048 § 1 : l'import de `verrous.ts` par le serveur en B11 est permis par la frontière, et l'interface ne l'importe jamais.

## Conséquences
- B5c ajoute à son périmètre : `src/server/config/moteur.ts` et son test, la réécriture du test du graphe de l'application, l'extension de `duree`. Le CEO reporte ces ajouts dans le ticket de B5c.
- B8, B9 et B11 ne sont plus bloqués par la question 1 de #268 une fois B5c fusionnée.
- #270 (B5b) n'a rien à changer pour cette décision ; ses écarts 1 et 3 sont acceptés.

## Questions ouvertes (non tranchées ici)
- **Samuel, Q332** (question 1 de la spécification) : règle R1 pour un lieu ajouté par la personne ; `EntreeMoteur.porteeR1` la porte en paramètre ; bloque la valeur finale en B11.
- **Product Owner** (avec ia-recherche pour la formule) : règle de classement à plusieurs sources (le score lit la première source) ; ne bloque pas B5.
- **Product Owner** : place de `mealBudgetPerPerson` dans le classement des repas (B5-PO-10) ; ne bloque pas B5.
- Toujours ouvertes depuis 0045, sans changement : définition d'une excursion (Product Owner), affichage d'un conflit entre deux étapes verrouillées (UX/UI), valeur de `transfertAeroportMinutes` (Product Owner), Q41 (Product Owner).

## Quand revoir cette décision
- Si un module de `src/server` doit être importé par du code client autrement qu'une action (la frontière suppose `server-only` partout ailleurs dans `src/server`).
- Si B8 ne peut pas dire, pour une durée, si elle est estimée.
- En B9, au déplacement de la formule de classement.
