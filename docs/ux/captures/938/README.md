# Captures de M5b (ticket 934) : versions du programme

Captures mobiles 390 × 844 de la PR #938 (handover frontend, « Une tâche est terminée quand », point 4 ; revue de la PR 938,
bloquant 1). Prises par Playwright le 2026-10-30 sur `next start` (adaptateur `mock`), voyage `mock_trip_edimbourg_debloque`,
panneau agrandi à 92 %.

**Données simulées, trois forçages locaux non versionnés.** L'historique simulé de `mock` (`src/adapters/mock-versions.ts`)
compte 4 versions : la version 1 date d'avant le déblocage, et la version 4 est la version actuelle. Pour montrer tous les
états dans un seul parcours :

1. `TRIP_VERSIONS_PAGE_SIZE` vaut 3 au lieu de 20 (`src/contracts/values.ts`), pour faire paraître « Voir les versions plus
   anciennes » ;
2. la borne du nombre de versions de `mock` vaut 5 au lieu de `VERSIONS_MAX_PAR_VOYAGE` (`src/adapters/index.ts`), pour
   obtenir le refus de la borne au second retour. La capture 9 a été reprise seule, avec les forçages 1 et 2, après la
   correction des bloquants tardifs ;
3. l'aperçu vers la version 2 rend `currentHasLockedStop` faux (`src/adapters/mock-versions.ts`), pour l'aperçu sans la
   phrase des étapes verrouillées : le jeu simulé a toujours une étape verrouillée, un engagement.

Les composants, textes et styles sont ceux de la PR. Le comportement est prouvé par `src/features/sejour/VersionsView.test.tsx`,
`src/adapters/mock-versions.test.ts` et `tests/db/versions.test.ts`. Le fond de carte est vide : les requêtes Google sont
bloquées pendant la capture.

| Fichier | État |
|---|---|
| `m5b-1-lien-sejour-390.png` | Séjour débloqué, défilé jusqu'en bas : lien « Versions du programme » sous « Jour par jour » |
| `m5b-2-liste-390.png` | Liste : « Version actuelle » sur la première, « Revenir à cette version » sur les versions proposées, « Voir les versions plus anciennes » |
| `m5b-3-avant-deblocage-390.png` | Après « Voir les versions plus anciennes » : groupe « Avant le déblocage », sans bouton |
| `m5b-4-apercu-verrouillees-390.png` | Aperçu avec la phrase « Ce retour peut toucher des étapes verrouillées. » et « Ce qui change » |
| `m5b-5-apercu-hors-ligne-390.png` | Même aperçu hors ligne : bandeau `offline`, « Appliquer » en `aria-disabled` |
| `m5b-6-apercu-sans-phrase-390.png` | Aperçu sans la phrase des étapes verrouillées : « Rien ne change dans ton programme. » (forçage 3) |
| `m5b-7-liste-hors-ligne-390.png` | Liste hors ligne : bandeau `offline`, « Revenir à cette version » en `aria-disabled` (correction 1, mineur 5) |
| `m5b-8-toast-retabli-390.png` | Après « Appliquer » : retour au Séjour, toast « Programme rétabli. » avec « Annuler » |
| `m5b-9-bandeau-erreur-390.png` | Bandeau d'erreur après un premier retour (version 5, « Version actuelle ») : « Appliquer » vers « Verrou retiré », version 4, refusé par la borne. Retour à la liste sans « Appliquer » : « Tu as fait beaucoup de retouches sur ce voyage : le retour à une version n'est plus possible. » (forçage 2 ; reprise après les bloquants tardifs du head `5cca917`) |

**Références visuelles de la CI** : inchangées. Aucune référence de `tests/visual/` ne montre le Séjour d'un voyage
débloqué sous `/voyages` : elles sont prises sous `/dev/voyages`, où `routes.versions()` vaut `null`, ou sur une Journée.
Le lien n'y paraît donc pas.
