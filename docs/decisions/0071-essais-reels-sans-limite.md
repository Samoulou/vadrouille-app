# 0071 — Exécutions réelles et essais sans limite côté studio

Statut : décidée par Samuel (argent et phases G0, réservés à Samuel, « Qui décide quoi » de `docs/CONTEXT.md`) ; définitive dès sa fusion. La mise en œuvre (§ « Mise en œuvre ») est un choix d'outillage du Tech Lead, définitif sans veto de Samuel 6 heures après la fusion (décision 0068).

Date : 2026-10-16 · Décideur : Samuel · Rédacteur : Tech Lead · Source : fil du projet Vadrouille, messages de Samuel ci-dessous · Ticket : #397

## Contexte

Jusqu'ici, la page de lancement de `p0-reel` refusait un lancement des modes `reel` et `essai` pour quatre règles du studio :

1. **une exécution par jour de quota Google** (0046 D13 point 3) : index unique `runs_one_per_quota_day_idx` de `prototype.runs` (`db/migrations/0003_prototype.sql`) et refus `cap_reached` de `reserverExecution` (`src/server/usage/neon.ts`) ;
2. **le décompte par brief et variante** (P0S2-PO-13 ; P0a2 : 2 exécutions comptées pour B, 1 pour A, une relance) : refus `run_quota_reached` (D24) de `src/server/p0/lancement.ts` ;
3. **le quota du jour par méthode** (95 requêtes Text Search, Place Details, et Routes en unité « requêtes ») : refus `daily_quota_insufficient` ;
4. **les plafonds du mois et les enveloppes jusqu'à G0** (Google 20 USD par mois et 40 USD en tout ; modèles 40 USD par mois et 80 USD en tout), sommés sur `prototype.forfaits` : refus `cap_reached` et `envelope_reached`.

Le premier essai réel (décision 0070) a consommé le jour de quota du 2026-10-16 ; avec la règle 1, aucun autre essai ni correctif ne pouvait être éprouvé le même jour.

Messages de Samuel, fil du projet, 2026-10-16, copiés tels quels :

- 11:17 UTC : « ok donc là mainteant je prends les reines, je gères mon budget, je vais mes tests quand je veux et combien je veux, et je te dirais quand c'est ok, faire des fixe, etc »
- 11:18 UTC : « exact, enlève les restrictions je fais mes tests, avec mes dashboards et je gère les couts »

Samuel a posé lui-même ses limites chez les fournisseurs : limite de dépense du compte OpenRouter, quotas journaliers par API dans Google Cloud.

Comme tous les agents écrivent sous le compte de Samuel (décision 0035), sa confirmation sur la PR de cette décision (libellé `owner-approved`, exigé de toute façon par la ligne ajoutée à `db-migrate.yml`) lève tout doute sur la source.

## Décision

1. **Levé** : ces quatre règles ne refusent plus aucun lancement d'une exécution `reel` ou `essai`. Samuel lance autant d'exécutions qu'il le veut, quand il le veut ; il suit et borne la dépense par ses propres tableaux de bord et ses limites chez les fournisseurs.
2. **Le décompte reste affiché**, pour information seulement : le tableau « Décompte » de la page (exécutions comptées et relances par brief et variante, exclusion de 0070 comprise) ne bloque plus rien. Le respect de P0a2 (nombre d'exécutions comptées pour G0) relève désormais du jugement de Samuel.
3. **Les forfaits restent écrits** dans `prototype.forfaits`, une ligne par exécution, pour information et pour les sommes que la page ou un relevé voudraient afficher ; ils ne refusent plus rien.

## Ce qui reste

- **Plafonds par exécution** (`prototype/config/plafonds.json`, `essai.json`, `mode-reel.json`) et leur registre en mémoire : ils arrêtent une exécution qui s'emballe (requêtes, éléments, coût des modèles, durée). Inchangés.
- **Contrôle propre au forfait** : en unité Routes « éléments » (Q330), un forfait de plus de 3 000 éléments ne tient pas dans la cadence d'une minute et reste refusé (`daily_quota_insufficient`, sans rien écrire). Il ne dépend que de la configuration, pas du nombre d'exécutions.
- **Toutes les protections de clés et de secrets**, le **refus en production** (garde de déploiement, 0034, D21), le cookie d'accès et le verrou S8.
- **Règles des données Google** (CLAUDE.md, « Jamais » ; 0011, 0027) : inchangées.
- **Économie Routes par voyage** (0053) : inchangée ; elle ne refuse aucun lancement.

## Mise en œuvre (Tech Lead)

- Migration `0007_essais_sans_limite` : `DROP INDEX prototype.runs_one_per_quota_day_idx` (seule instruction, sous `vadrouille_owner`) ; retour arrière `0007_essais_sans_limite.down.sql`, qui recrée l'index à l'identique et échoue sans rien supprimer si un jour compte déjà plusieurs exécutions. Elle n'est appliquée à la base Neon que par `db-migrate`, après l'`owner-approved` de Samuel sur sa ligne de `MIGRATIONS_APPROUVEES` (0056 § 3), ajoutée par la même PR. Avant son application, le nouveau code échoue fermé sur une seconde exécution du jour (violation d'unicité, `usage_unavailable`, rien d'écrit).
- `reserverExecution` ne refuse plus une seconde exécution du jour ; `LIMITES_PROTOTYPE` (`src/server/usage/forfait.ts`) vaut l'infini pour le quota du jour, les mois et les enveloppes. Le mécanisme `refusDuForfait` reste, éprouvé par ses tests avec les anciennes valeurs : rétablir une limite est un changement de ces seules valeurs, par une nouvelle décision.
- Le lancement ne lit plus le suivi et ne rend plus `run_quota_reached` (retiré des statuts du lancement et de son texte) ; `decompte()` sert la page seule.
- **Identifiant de voyage unique** : `proto_<destination>_<AAAAMMJJ>_<n>`, où `n` est le rang de l'exécution dans son jour de quota (exécutions `reel` et `essai`, ordonnées par début puis identifiant), lu en base par `lireExecution` (`numeroDuJour` du contrat `ExecutionEnCours`). Au-delà de 999 exécutions le même jour, l'identifiant est refusé et l'exécution s'arrête sans programme.
- Les codes `cap_reached`, `envelope_reached` et `daily_quota_insufficient` restent dans le port de consommation (`CODES_REFUS_USAGE`) : le registre par exécution et les clients réels s'en servent.

## Limites

- La décision ne vaut que pour le prototype (modes `reel` et `essai` de `p0-reel`). Elle ne change ni les plafonds de l'application (B7, B9), ni `usage_ledger`.
- L'exclusion de 0070 reste désignée par son tuple : il ne désigne qu'une ligne, le déploiement `d61e9fa` refusant lui-même une seconde exécution du jour. Une nouvelle exclusion devra vérifier l'unicité de son tuple.
- Tests de base protégés (`tests/db/`) qui supposent encore une exécution par jour : ils sont listés dans la PR pour Samuel, seul à pouvoir les modifier.

## Quand revoir

Quand Samuel le demande, ou avant toute ouverture à un public (G1) : les limites du studio seraient alors rétablies, ou remplacées, par une nouvelle décision.
