# 0091 — L'exécution réelle Rome arrêtée par la limite Google le soir du 2026-10-18 ne compte pas pour G0

Statut : décidée par Samuel (le décompte de P0a2 relève des phases G0, réservées à Samuel, « Qui décide quoi » de `docs/CONTEXT.md`) ; définitive dès sa fusion, sans délai de veto (c'est la décision de Samuel lui-même). Le mécanisme (§ « Mise en œuvre ») est celui de 0089, choix d'outillage soumis au Tech Lead.

Date : 2026-10-18 · Décideur : Samuel · Rédacteur : Product Owner (pour le CEO) · Source : carte de décision du projet Vadrouille (ci-dessous) · Précédents : décisions 0070 et 0089

## Contexte

Le soir du 2026-10-18, Samuel a lancé une exécution réelle du brief `rome-1.json`, variante B :

| Champ | Valeur |
|---|---|
| Workflow | `wrun_41M57YCVXJ50T41W3BH260MEP2` |
| Nature | « Exécution comptée » (mode `reel`) |
| Jour de quota | `2026-10-18` |
| Commit du déploiement | `0d0bbaa36536cf0d26d1d3b55218d9183375b92f` |
| Code d'arrêt | `pipeline_failed` |

Le journal Vercel de l'exécution porte `p0.step_failed` avec `phase=routes`, `errorName=ErreurClientGoogle` et `failureCode=upstream_rate_limited` : Google Routes a refusé les appels parce que le plafond quotidien de 1000 éléments fixé dans la console Google de Samuel était épuisé. Ce n'est **pas un défaut du programme** : la cause est une limite de compte Google, extérieure au code du studio.

Selon `src/server/p0/decompte.ts` (P0S2-PO-13), seuls les codes d'arrêt de `CODES_EXTERNES_SUIVI` (`upstream_unavailable`, `upstream_redirect`, `usage_unavailable`) ouvrent une relance ; l'exécution s'est arrêtée en `pipeline_failed`, qui n'en fait pas partie : sans décision, elle compte.

Carte de décision du projet Vadrouille :

- Question : « Compter l'essai de Rome arrêté ce soir par la limite Google ? »
- Choix de Samuel, de sa main sur la carte, 2026-10-18 16:54 UTC : **« Ne pas compter »**.

Comme tous les agents écrivent sous le compte de Samuel (décision 0035), une confirmation de sa main sur la PR de cette décision lève tout doute sur la source (voir la description de la PR). Ici le choix vient d'un clic de Samuel sur la carte.

## Décision

1. **Exclusion.** L'exécution réelle `wrun_41M57YCVXJ50T41W3BH260MEP2` (ligne de `prototype.runs` : mode `reel`, brief `rome-1.json`, variante `B`, jour de quota `2026-10-18`, arrêt `pipeline_failed`, commit `0d0bbaa36536cf0d26d1d3b55218d9183375b92f`) est **exclue du décompte G0** (P0a2, P0S2-PO-13) : elle n'est **ni une exécution comptée, ni une relance**.
2. **Le reste du décompte de `rome-1.json`/B est inchangé** : les exclusions de 0089 restent, l'exécution du matin reste comptée.
3. **La dépense reste comptée** dans `prototype.forfaits` (inchangé) : elle a eu lieu. Aucune écriture en base n'est faite pour cette décision.
4. **Grille G0 et P0b2.** L'exécution exclue n'est pas l'une des « deux exécutions B » de `rome-1.json` (P0b2, « meilleure des deux ») et n'entre dans aucun bilan B1 à B6. Elle n'a écrit aucun programme. Le rapport d'ia-recherche pour P0a2 la mentionne comme « exclue (0091) », sans la compter.
5. **Ce n'est pas un essai d'intégration.** Elle ne remplit pas la condition « Essai d'intégration réussi » de P0a2 (`specs/P0-suite-2.md`, tableau des tâches).

## Limites

- Elle ne vaut **que pour cette exécution**. Comme 0070 et 0089, elle ne crée pas de règle générale : P0S2-PO-13 reste inchangée, et `upstream_rate_limited` n'est pas ajouté aux causes externes. Exclure une autre exécution exige une **nouvelle décision écrite de Samuel**, et une nouvelle entrée dans la liste du code.
- Motif retenu : une **limite de compte Google** (plafond quotidien de la console de Samuel) a arrêté l'exécution avant tout programme ; le code du studio n'est pas en cause.
- Rien n'est effacé : la ligne de `prototype.runs` reste en base, visible dans le suivi de la page.
- **Une autre exécution comptée de rome-1/B arrêtée en `pipeline_failed` le 2026-10-18 sur le commit `0d0bbaa` compterait** (§ « Mise en œuvre ») : elle n'est pas visée par la décision de Samuel. Tant que le plafond Google n'est pas rétabli, une nouvelle exécution s'arrêterait probablement de la même façon.

## Mise en œuvre (proposée au Tech Lead)

Même mécanisme que 0089 : une entrée dans la liste fermée `EXECUTIONS_EXCLUES` de `src/server/p0/decompte.ts`, qui désigne l'exécution par son tuple (brief, variante, jour de quota, code d'arrêt, commit) et renvoie à cette décision. Comme toute entrée depuis 0089, elle **n'exclut qu'une exécution au plus** dans `decompte()` : une seconde exécution qui répond au même tuple compte.

**Unicité du tuple.** Le commit `0d0bbaa` n'est porté par aucune des exécutions de 0089 (`cfca0b5`, `efc0994`) ni par celle du matin : le tuple ne se confond avec aucune autre entrée. Les essais d'intégration (`mode = essai`) ne peuvent pas répondre. Une nouvelle exécution réelle rome-1/B, lancée le même jour sur le même déploiement et arrêtée en `pipeline_failed`, répondrait au même tuple ; la règle « une exécution au plus par entrée » la laisse compter.

Tests dans `tests/unit/p0/decompte.test.ts` : contenu exact de la liste ; exclusion effective de l'exécution, avec les exclusions de 0089 et l'exécution du matin comptée ; une seconde exécution du même tuple compte ; un seul champ différent fait compter l'exécution ; un essai du même jour n'est pas visé.

Options écartées : celles de 0089 (identifiant uuid, ajout de l'heure ou du `wrun_…` au contrat, colonne « exclue » en base) ; ajouter `upstream_rate_limited` à `CODES_EXTERNES_SUIVI` (règle générale, que Samuel n'a pas décidée).

L'exclusion ne prend effet sur la page qu'après la mise à jour de `p0-reel` depuis `main` par le rôle Release.

## Quand revoir

Si une autre exécution est arrêtée par une limite Google : Samuel décide alors au cas par cas, ou fixe une règle générale qui amenderait P0S2-PO-13 (par exemple traiter `upstream_rate_limited` comme une cause externe).
