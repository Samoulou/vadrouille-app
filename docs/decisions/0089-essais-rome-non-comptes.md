# 0089 — Les deux exécutions réelles Rome ratées du 2026-10-18 ne comptent pas pour G0

**Concernée par 0093 point 2** (PR #512) : une exécution qui n'écrit aucun programme ne compte plus jamais pour G0 ; plus de décision au cas par cas. Les exclusions ci-dessous restent valables.

Statut : décidée par Samuel (le décompte de P0a2 relève des phases G0, réservées à Samuel, « Qui décide quoi » de `docs/CONTEXT.md`) ; définitive dès sa fusion, sans délai de veto (c'est la décision de Samuel lui-même). Le mécanisme (§ « Mise en œuvre ») est un choix d'outillage soumis au Tech Lead.

Date : 2026-10-18 · Décideur : Samuel · Rédacteur : Product Owner (pour le CEO) · Source : fil « Routine cycle du studio », projet Vadrouille (carte de décision ci-dessous) · Ticket : #493 · Diagnostic : note de l'IA-recherche « Diagnostic des exécutions Rome de l'après-midi (2026-10-18) » (fichier du projet `essai-reel/diagnostic-rome-2.md`, hors dépôt) · Précédent : décision 0070

## Contexte

Le 2026-10-18, Samuel a lancé trois exécutions du brief `rome-1.json`, variante B, toutes au jour de quota `2026-10-18` (diagnostic, § 1) ; celles de l'après-midi sont des « Exécution comptée » (mode `reel`) :

| | Matin | Après-midi n° 1 | Après-midi n° 2 |
|---|---|---|---|
| Workflow | (non relevé) | `wrun_41M57JCM3G50T1SSVCX1XG7HRT` | `wrun_41M57JWPHV50HNB1M3TH4D2140` |
| Lancement | matin (fin de recherche à 09:33 UTC) | vers 13:14 UTC | vers 13:23 UTC |
| Commit du déploiement | `cfca0b58ccf67e4d10196adea296045ec98fdb61` | `cfca0b58ccf67e4d10196adea296045ec98fdb61` | `efc0994f3e4e8eb5eb081c84b754797b980cf166` |
| Issue | programme écrit | arrêtée, `pipeline_failed` | arrêtée, `pipeline_failed` |

Les deux exécutions de l'après-midi se sont arrêtées au même endroit : dans l'étape finale, pendant le calcul des trajets Routes, après un ou deux appels Routes réussis. Aucun programme n'a été écrit et l'étape « raisons » n'a pas démarré. La cause est un **défaut de notre code** dans la lecture des trajets Routes (cause la plus probable : une réponse Routes en transports en commun rejetée par notre client) ; ce n'est ni une cause externe, ni un plafond, ni l'échéance (diagnostic, § 1 à 3). Le rapport d'exécution que Samuel a collé dans le fil à 13:30:03 UTC confirme pour la seconde : « Nature : exécution comptée », « Commit : efc0994f3e4e8eb5eb081c84b754797b980cf166 », « Code d'arrêt : pipeline_failed ».

Selon `src/server/p0/decompte.ts` (P0S2-PO-13), `pipeline_failed` n'est pas une cause externe : ces deux fins comptent. `rome-1.json`/B n'avait donc plus aucune exécution comptée disponible au sens de P0a2 (diagnostic, § 4).

Carte de décision du fil « Routine cycle du studio » (message `cmsg_0174CRqum9q8GNfZHmNHcYvREfShrtTHKk9SqE5aHTDYYv`, posée à 13:40:39 UTC), copiée telle quelle :

- Question : « Ne pas compter les deux essais Rome ratés de cet après-midi ? »
- Contexte : « Les deux essais Rome de 13 h 14 et 13 h 23 se sont arrêtés à cause d'un défaut de notre code, pas d'un problème chez Google. Ils comptent aujourd'hui, et il ne reste plus d'essai compté pour Rome avec cette variante. Les exclure se fait comme le 16 octobre : une petite décision écrite, puis une ligne dans le code. »
- Options : « Ne pas compter » (« Les deux essais sont retirés du décompte. Tu retrouves tes essais comptés pour Rome. ») ; « Les garder » (« Ils restent comptés. Rome ne pourra se tester qu'en essai d'intégration ou avec l'autre variante. »).

Choix de Samuel (compte `user_017VkTG4EynZVdjnt8RL7MHD`), 2026-10-18 13:50:26 UTC, option 0 : **« Ne pas compter »**.

Comme tous les agents écrivent sous le compte de Samuel (décision 0035), une confirmation de sa main sur la PR de cette décision lève tout doute sur la source (voir la description de la PR). Ici le choix vient d'un clic de Samuel sur la carte, attribué à son compte par la plateforme.

## Décision

1. **Exclusion.** Les deux exécutions réelles suivantes sont **exclues du décompte G0** (P0a2, P0S2-PO-13) : elles ne sont **ni des exécutions comptées, ni des relances** :
   - `wrun_41M57JCM3G50T1SSVCX1XG7HRT` : ligne de `prototype.runs` en mode `reel`, brief `rome-1.json`, variante `B`, jour de quota `2026-10-18`, arrêt `pipeline_failed`, commit `cfca0b58ccf67e4d10196adea296045ec98fdb61` ;
   - `wrun_41M57JWPHV50HNB1M3TH4D2140` : ligne de `prototype.runs` en mode `reel`, brief `rome-1.json`, variante `B`, jour de quota `2026-10-18`, arrêt `pipeline_failed`, commit `efc0994f3e4e8eb5eb081c84b754797b980cf166`.
2. **L'exécution réussie du matin reste comptée** (Samuel n'en a pas parlé ; elle a écrit un programme). `rome-1.json`/B en est donc à 1 exécution comptée sur 2, et garde sa relance (0 sur 2 si celle du matin était un « Essai d'intégration », ce que le diagnostic ne relève pas).
3. **La dépense reste comptée** dans `prototype.forfaits` (inchangé) : elle a eu lieu. Aucune écriture en base n'est faite pour cette décision.
4. **Grille G0 et P0b2.** Les exécutions exclues ne sont pas parmi les « deux exécutions B » de `rome-1.json` (P0b2, « meilleure des deux ») et n'entrent dans aucun bilan B1 à B6. Elles n'ont écrit aucun programme. Le rapport d'ia-recherche pour P0a2 les mentionne comme « exclues (0089) », sans les compter.
5. **Ce ne sont pas des essais d'intégration.** Elles ne remplissent pas la condition « Essai d'intégration réussi » de P0a2 (`specs/P0-suite-2.md`, tableau des tâches).

## Limites

- Elle ne vaut **que pour ces deux exécutions**. Comme 0070, elle ne crée pas de règle générale « un défaut du studio ne compte pas » : P0S2-PO-13 reste inchangée. Exclure une autre exécution exige une **nouvelle décision écrite de Samuel**, et une nouvelle entrée dans la liste du code.
- Motif retenu : un **défaut du code du studio** (lecture des trajets Routes) a arrêté les exécutions avant tout programme.
- Rien n'est effacé : les lignes de `prototype.runs` restent en base, visibles dans le suivi de la page.
- **Une autre exécution comptée de rome-1/B arrêtée en `pipeline_failed` le 2026-10-18, sur l'un de ces deux commits, compterait** (§ « Mise en œuvre ») : elle n'est pas visée par la décision de Samuel. Le diagnostic (§ 4) déconseille de toute façon une nouvelle « Exécution comptée » de rome-1 avant le correctif ; un « Essai d'intégration » ne compte pas.

## Mise en œuvre (proposée au Tech Lead)

Même mécanisme que 0070 : deux entrées dans la liste fermée `EXECUTIONS_EXCLUES` de `src/server/p0/decompte.ts`, chacune désignant l'exécution par son tuple (brief, variante, jour de quota, code d'arrêt, commit), et renvoyant à cette décision.

**Unicité du tuple.** Depuis 0071 (index `runs_one_per_quota_day_idx` supprimé), plusieurs exécutions peuvent partager un jour de quota : le tuple ne désigne plus une seule ligne par construction. Vérification pour ces deux entrées :

- le tuple `cfca0b5` n'est pas celui de l'exécution du matin (même commit, mais programme écrit, pas d'arrêt `pipeline_failed`) ; seule une exécution `reel` arrêtée peut répondre ;
- les essais d'intégration (`mode = essai`) ne peuvent pas répondre ;
- les trois exécutions rome-1/B relevées dans les journaux du 2026-10-18 sont celles du tableau ci-dessus (diagnostic, § 1) : aujourd'hui, chaque tuple ne désigne qu'une ligne ;
- **mais rien n'empêche une nouvelle exécution réelle rome-1/B, lancée le même jour sur le déploiement `efc0994` (ou `cfca0b5`), de s'arrêter elle aussi en `pipeline_failed`** : elle répondrait au même tuple, et le diagnostic juge cet arrêt probable tant que le correctif n'est pas en ligne. La clé seule ne suffit donc pas.

Le seul champ qui distingue sûrement les lignes est l'identifiant uuid de `prototype.runs`, qu'aucun agent ne connaît sans lire la base, et le contrat `ExecutionSuivie` ne porte ni l'identifiant du workflow (`wrun_…`) ni l'heure de début. Mécanisme retenu, le plus petit sans lecture ni écriture en base : **chaque entrée de la liste n'exclut qu'une exécution au plus** dans `decompte()`. Une seconde exécution qui répond au même tuple compte. Les exécutions d'un même tuple ont les mêmes champs décomptés : le total ne dépend pas de celle qui est retirée, et la page (tableau du décompte, `src/server/p0/page-acces.ts`) n'affiche que ce total. L'entrée de 0070 n'est pas changée par cette règle (son tuple ne désigne qu'une ligne).

Tests dans `tests/unit/p0/decompte.test.ts` : contenu exact de la liste ; exclusion effective des deux exécutions et exécution du matin comptée (une place B rendue sur deux) ; une seconde exécution du même tuple compte ; un seul champ différent fait compter l'exécution ; un essai du même jour n'est pas visé.

Options écartées : un identifiant uuid (inconnu sans lecture de la base) ; ajouter l'heure de début ou l'identifiant `wrun_…` au contrat `ExecutionSuivie` et à `prototype.runs` (changement de contrat, et pour `wrun_…` migration, rôle Backend et verdict Sécurité, pour deux lignes) ; une colonne « exclue » en base (écriture en base réelle, comme pour 0070).

L'exclusion ne prend effet sur la page qu'après la mise à jour de `p0-reel` depuis `main` par le rôle Release.

## Quand revoir

Si une autre exécution est arrêtée par un défaut du studio : Samuel décide alors au cas par cas, ou fixe une règle générale qui amenderait P0S2-PO-13. Si la page doit un jour montrer quelle exécution est exclue (et non le seul total), il faudra désigner les exécutions par leur identifiant.
