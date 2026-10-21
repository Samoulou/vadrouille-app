# 0113 — `stopReason` du journal : liste fermée dans un module feuille, `missing_key` pris de sa définition unique

Statut : **proposée**, définitive dès sa fusion (décision 0093) · **décision de la Sécurité** (forme d'un champ de journal et texte à suffixe `_KEY` du régime de confinement ; la revue de #600, mineur 5, lui réserve ce point : « pour `stopReason`, la décision de la Sécurité prévaut »), sans délai de veto ; à lister dans la note de version suivante (rubrique « Décisions prises par le studio »). Elle n'engage ni argent, ni compte externe, ni donnée personnelle, et ne supprime ni ne désactive aucun test.

Date : 2026-10-21 · Décideur : Sécurité · Ticket : #607 · Décisions liées : 0077 § 3 point 1, 0081 B9-TL-6 (h), 0087 § 1.4, 0090 § 3 point 4 · Question : Q550

Numérotation (relue le 2026-10-21 sur `main` `9b7282e`) : `main` porte 0001 à 0111 ; la PR ouverte #604 porte 0112 ; aucune autre PR ouverte ne porte un 0113.

## Contexte

B9d (#600) a ajouté l'événement `generation.full_stuck` (niveau `warn`) et son champ `stopReason`, copie de `generation_runs.stop_reason` de la ligne bloquée. `src/server/log.ts` n'en contrôlait que la forme (`^[a-z][a-z_]{0,39}$`) : un nom de lieu en minuscules (« colosseo », « fontana_di_trevi ») serait passé dans le journal. Le `CHECK` `generation_runs_stop_reason_check` de la migration 0012 ferme la colonne, mais il est `NOT VALID` (lignes antérieures non vérifiées) : la base seule ne garantit pas la liste. Le journal ne peut pas importer `CODES_ARRET` (`src/server/generation/raison-echec.ts`) : `ligne/creation-imports` réserve `src/server/generation/` à ses importateurs nommés, et `raison-echec.ts` atteint `@/ai/natures`.

Le texte `missing_key` est un « texte à suffixe `_KEY` » du régime de confinement (spécification P0c, section 5) : il n'est admis qu'à un seul endroit, `src/ai/erreurs.ts` (`CODE_CLE_ABSENTE`, ligne `secret:MISSING_KEY` de `tests/unit/confinement/donnees/lignes-textes.json`, `"nombre": 1`), même dans les tests.

## Décision

1. **Liste fermée.** `stopReason` n'admet que les codes de `CODES_ARRET` (même liste que le `CHECK` de la migration 0012). Une valeur hors liste, ou non textuelle, est **retirée** et comptée dans `dropped`, comme pour tout champ du journal : jamais tronquée, remplacée ni recopiée. Aucune valeur générique n'est écrite à sa place (le journal ne substitue jamais).
2. **Module feuille.** La liste est écrite dans `src/server/log-codes-arret.ts` (`CODES_ARRET_JOURNAL_SANS_CLE`), sans autre import que `server-only`. Hors de `src/server/generation/`, il est importable par `log.ts` sans dérogation à `ligne/creation-imports` ; il n'atteint ni `src/ai`, ni l'ancrage. C'est une **copie** de `CODES_ARRET`, comme `LOG_STEP_FAILURE_CODES` (0090 § 3 point 4) : son égalité est vérifiée par `tests/unit/server/journal-stop-reason.test.ts`, la copie ne peut pas dériver sans le faire échouer.
3. **Exemption `missing_key` : retenue sous sa forme existante, sans nouvelle ligne de confinement.** Le module feuille **n'écrit pas** `missing_key` ; `log.ts` l'ajoute à la liste depuis `CODE_CLE_ABSENTE`, qu'il importe déjà de `@/ai/erreurs` (exemption exacte de 0077 § 3 point 1, inchangée). Le texte reste écrit une seule fois dans le dépôt ; `lignes-textes.json` n'est pas modifié ; aucune nouvelle capacité `secret:` n'est admise. Le test vérifie que la copie feuille ne contient pas le code de clé absente et que la liste admise, code compris, égale `CODES_ARRET`.
4. **Tests** (`tests/unit/server/journal-stop-reason.test.ts`) : égalité de la copie plus `CODE_CLE_ABSENTE` avec `CODES_ARRET`, sans doublon ; module feuille sans import hors `server-only` ; chaque code de `CODES_ARRET` passe ; des valeurs hors liste de la bonne forme (noms de lieux en minuscules, `autre`, 40 caractères), une casse ou une espace différente, la chaîne vide et des valeurs non textuelles sont retirées, `dropped` vaut 1, la valeur n'apparaît pas dans la ligne.

## Conséquences

- Un code ajouté à `CODES_ARRET` (et au `CHECK`) sans être ajouté à la copie fait échouer le test ; tant que ce n'est pas fait, il serait retiré du journal (échec fermé), jamais écrit.
- `generation.full_stuck` ne peut plus porter qu'un des 27 codes fermés : aucune donnée de lieu, même issue d'une ligne antérieure au `CHECK`.
- Réponse à Q550 (Sécurité) : liste fermée retenue.
