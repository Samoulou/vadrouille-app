# 0131 — Écran 1 du site d'essai rendu à chaque requête ; refus de la recherche de ville journalisés

Statut : **acceptée** · Date : 2026-10-25 · Décideur : Tech Lead, avec le CEO (ordre des tâches) · PR : #763 · **Amende** : 0032 § A6.2 (pour `/voyages/nouveau` seulement), 0129 § 2 point 2 (« ni stockées ni journalisées »), § 9 point 1 (« sans journal `p0.guard_closed` sur ces actions ») et ligne 21 des Suites (journal d'audit) · Verdict Sécurité : approuvé (revues des heads `735f255` et `5147975`) · Définitive à sa fusion (0093). À lister dans la prochaine note de version (« Décisions prises par le studio »).

## Contexte
Constat de Samuel du 2026-10-25 : sur le site d'essai, « Tro » dans Destination ne donnait ni suggestion ni texte. L'écran 1, prérendu, ne montait la recherche de ville (`DestinationVille`) que si l'adresse portait `?site=essai` ; ouvert sans ce paramètre, il montrait le champ texte libre, sans appel serveur. Et chaque refus de la recherche était muet : la cause était invisible.

## Décision
1. `src/app/(creation)/voyages/nouveau/page.tsx` exporte `dynamic = "force-dynamic"` et lit `siteEssaiAutorise()` côté serveur : sur le site d'essai, la recherche est montée quelle que soit l'adresse. Hors site d'essai, `?site=essai` reste lu dans l'adresse (captures, e2e simulés). La page sort de `SANS_EXPORT` et du manifeste de prérendu.
2. Événement fermé **`p0.ville_refusee`** à chaque refus de `suggererVillesEssai` / `choisirVilleEssai` et à l'exception attrapée par l'action serveur : `reason` (`LOG_VILLE_REASONS`), `action`, `guard`, `errorName`, et deux champs admis **sur cet événement seulement** : `googleCode` (copie fermée de `CODES_ERREUR_GOOGLE` et `place_not_found`) et `httpStatus` (100 à 599, code HTTP d'une réponse de Google autre que 200 ; jamais le corps). Jamais la saisie, un `placeId`, un texte Google, le cookie ni une clé.

## Conséquences
- **Volume** : les refus `entree_invalide`, `acces` et `garde` peuvent être écrits à chaque pause de frappe, par tout appelant : niveau `info` ; les autres motifs en `warn`. Rétention : celle des journaux d'exécution Vercel, sans stockage ajouté.
- **Erreur 500 possible** : avec `DATA_ADAPTER=prototype` hors de la liste blanche (0032 § A4.2), `siteEssaiAutorise()` lève et l'écran 1 répond 500, comme l'accueil ; avant, la page ne dépendait de rien.
- **Portée de l'amendement de 0129** : `p0.ville_refusee` remplace l'absence de journal de § 9 point 1 pour les motifs `garde`, `acces` et `entree_invalide`. Les textes Google restent non journalisés : § 2 point 2 est maintenu pour eux (seuls le motif, l'action et les codes fermés sont écrits).
