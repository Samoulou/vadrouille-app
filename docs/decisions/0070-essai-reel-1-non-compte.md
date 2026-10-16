# 0070 — L'exécution réelle du 2026-10-16 ne compte pas pour G0

Statut : décidée par Samuel (le décompte de P0a2 relève des phases G0, réservées à Samuel, « Qui décide quoi » de `docs/CONTEXT.md`) ; définitive dès sa fusion. Le mécanisme (§ « Mise en œuvre ») est un choix d'outillage soumis au Tech Lead.

Date : 2026-10-16 · Décideur : Samuel · Rédacteur : Product Owner (pour le CEO) · Source : fil du studio, projet Vadrouille (message de Samuel ci-dessous) · PR #<à compléter> · Diagnostic : note de l'IA-recherche « Diagnostic du premier essai réel » (fichier du projet `essai-reel/diagnostic-essai-1.md`, hors dépôt) · Correctif : Q460, branche `claude/460-ancrage-sans-statut`

## Contexte

Le 2026-10-16 vers 09:00 UTC, Samuel a lancé la première exécution réelle depuis la page de lancement de `p0-reel` (déploiement au commit `d61e9faefacf568ad39833e8ac611ba717e0fbdd`) : exécution du workflow `wrun_41M51Z1RQ450GN2FF85TK80W6Z`, brief `edimbourg-1.json`, variante B, nature « Exécution comptée » (choisie par erreur au lieu de « Essai d'intégration »). Elle s'est arrêtée en `pipeline_failed` à l'étape d'ancrage, à cause d'un **bug de notre code** : le client Places exige `businessStatus`, que Google ne renvoie pas pour le logement du brief, un quartier (diagnostic, § 2 ; correctif Q460).

Selon `src/server/p0/decompte.ts` (P0S2-PO-13), `pipeline_failed` n'est pas une cause externe : la fin compte. `edimbourg-1.json`/B avait donc utilisé 1 de ses 2 exécutions comptées, et le jour de quota du 2026-10-16 est pris (index unique `runs_one_per_quota_day_idx` de `prototype.runs`).

Échange dans le fil du studio, copié tel quel :
- Question du CEO, juste avant : « on rend cette exécution comptée perdue, puisque c'est notre bug et pas l'IA ? Ma reco : oui. »
- Réponse de Samuel, 2026-10-16 09:20:31 UTC, message `cmsg_0174CRqum9q8GNfZHmNHcYvRRngyrdpEML6rrS9Y8d5uye` : « aujourd'hui selon ce que je vois l'ia a couté 2.5 centime de dollar et google 0, donc on ne compte pas cet essaie ».

Comme tous les agents écrivent sous le compte de Samuel (décision 0035), une confirmation de sa main sur la PR de cette décision lève tout doute sur la source (voir la description de la PR).

## Décision

1. **Exclusion.** L'exécution réelle `wrun_41M51Z1RQ450GN2FF85TK80W6Z` (ligne de `prototype.runs` : mode `reel`, brief `edimbourg-1.json`, variante `B`, jour de quota `2026-10-16`, arrêt `pipeline_failed`, commit `d61e9faefacf568ad39833e8ac611ba717e0fbdd`) est **exclue du décompte G0** (P0a2, P0S2-PO-13) : elle n'est **ni une exécution comptée, ni une relance**. `edimbourg-1.json`/B dispose de nouveau de ses 2 exécutions comptées et de sa relance.
2. **Le jour de quota du 2026-10-16 reste consommé.** C'est le plus simple et le plus sûr : la réservation (une exécution `reel` ou `essai` par jour de quota) est garantie par la base et n'est pas touchée ; aucune écriture en base n'est faite pour cette décision. Aucune relance n'était de toute façon possible ce jour-là : le correctif Q460 n'est pas déployé sur `p0-reel`, et le même brief échouerait de la même manière (diagnostic, § 5). Le calendrier de P0a2 (« au moins 10 jours de quota, essai compris ») glisse d'un jour.
3. **La dépense reste comptée** dans les plafonds du jour, du mois et de l'enveloppe (`prototype.forfaits` inchangé) : elle a eu lieu.
4. **Grille G0 et P0b2.** L'exécution exclue n'est pas l'une des « deux exécutions B » d'`edimbourg-1.json` (P0b2, « meilleure des deux ») et n'entre dans aucun bilan B1 à B6. Elle n'a écrit aucun programme. Le rapport d'ia-recherche pour P0a2 la mentionne comme « exclue (0070) », sans la compter.
5. **Ce n'est pas un essai d'intégration.** Elle ne remplit pas la condition « Essai d'intégration réussi » de P0a2 (`specs/P0-suite-2.md`, tableau des tâches).

## Limites

- Elle ne vaut **que pour cette exécution**. Elle ne crée pas de règle générale « un bug du studio ne compte pas » : P0S2-PO-13 reste inchangée (toute fin autre qu'une cause externe compte). Exclure une autre exécution exige une **nouvelle décision écrite de Samuel**, et une nouvelle entrée dans la liste du code.
- Motif retenu : un **bug de code du studio** a arrêté l'exécution avant tout programme, pour une dépense faible (Samuel : 0,025 USD de modèles, 0 USD Google affiché). L'erreur de sélection de la nature (« comptée » au lieu de « essai ») n'est pas le motif ; elle est traitée à part (ergonomie de la page, diagnostic § 6).
- Rien n'est effacé : la ligne de `prototype.runs` reste en base, visible dans le suivi de la page et dans le rapport de la dernière exécution.

## Mise en œuvre (proposée au Tech Lead)

Le décompte lit `prototype.runs`, qui ne conserve pas l'identifiant du workflow (`wrun_…`) ; l'identifiant de ligne (uuid) n'est connu d'aucun agent et ne serait lisible qu'en base. Mécanisme retenu, le plus petit sans écriture en base ni migration :

- **liste fermée versionnée** `EXECUTIONS_EXCLUES` dans `src/server/p0/decompte.ts`, chaque entrée renvoyant à sa décision ; une entrée désigne l'exécution par son tuple (brief, variante, jour de quota, code d'arrêt, commit) ; l'index unique `runs_one_per_quota_day_idx` en fait une seule ligne, et seule une exécution `reel` arrêtée peut répondre ;
- `decompte()` ignore une exécution exclue ; `lancementDansLeDecompte()` et la page de lancement (tableau du décompte) en héritent ;
- tests dans `tests/unit/p0/decompte.test.ts` : contenu exact de la liste, exclusion effective (deux places B rendues), et un seul champ différent suffit à faire compter l'exécution.

Options écartées : une colonne « exclue » ou une mise à jour de la ligne en base (écriture en base réelle et migration, rôle Backend et verdict Sécurité, pour une seule ligne) ; une variable d'environnement (non versionnée, sans test, hors du dépôt public) ; un identifiant uuid (inconnu sans lecture de la base).

L'exclusion ne prend effet sur la page qu'après la mise à jour de `p0-reel` depuis `main` par le rôle Release, comme le correctif Q460.

## Quand revoir

Si une autre exécution est arrêtée par un bug du studio : Samuel décide alors au cas par cas, ou fixe une règle générale qui amenderait P0S2-PO-13.
