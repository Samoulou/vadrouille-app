# Captures de M5c (ticket 904) : « Signaler une erreur »

Captures mobiles 390 × 844 de la PR #909, adaptateur `mock`, voyage `mock_trip_edimbourg_debloque`, prises par Playwright
sur le serveur de production construit (correction 1 de la revue, bloquant 3) :

| Fichier | État |
|---|---|
| `m5c-1-feuille-sans-motif-390.png` | Feuille ouverte, aucun motif choisi |
| `m5c-2-erreur-sans-motif-390.png` | « Envoyer » sans motif : « Choisis ce qui ne va pas. » |
| `m5c-3-motif-choisi-390.png` | Motif « Fermé ou n'existe plus » choisi |
| `m5c-4-confirmation-avec-remplacer-390.png` | Fiche après l'envoi (`closed`, étape non verrouillée, voyage débloqué) : confirmation et « Remplacer cette étape » |
| `m5c-5-confirmation-sans-remplacer-390.png` | Fiche après l'envoi (`hours`) : confirmation seule |

Références de la CI (`tests/visual/sejour-fiche.visual.spec.ts`) : elles sont prises sur `/dev/voyages/…`, où le bouton
« Signaler une erreur » n'est pas rendu (`reportable` n'est vrai que sur les routes `/voyages`, `src/features/sejour/screens.tsx`).
La feuille ne les change donc pas : la régénération du 2026-10-30 (commit 1275c32) a laissé ces 5 références identiques,
et la feuille n'a pas encore de référence visuelle de la CI.
