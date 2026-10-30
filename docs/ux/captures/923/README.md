# Captures de M5a (ticket 919) : verrou sur `api`

Captures mobiles 390 × 844 de la PR #923 (handover frontend, « Une tâche est terminée quand », point 4 ; revue de la PR 923,
mineur 11), prises par Playwright le 2026-10-30 sur `next dev`, voyage `mock_trip_edimbourg_debloque`.

**Rendu de `api` reproduit localement, pas un serveur `api` :** l'adaptateur `api` demande une session réelle et l'envoi du
code par Mailpit, absents du poste. Les captures sont donc prises sur les données simulées avec deux forçages **locaux, non
versionnés** : `commitmentReadOnly` vrai dans `TripShell` (ce que vaut `serverStore !== null` sur `api`), et le refus du
serveur simulé dans `JourneeView` (premier appui : `VerrouNonEnregistre("conflict")`, second : tout autre refus). Les
composants, textes et styles sont ceux de la PR ; le comportement est prouvé par `src/features/sejour/JourneeView.verrou.test.tsx`
et `StopSheet.test.tsx`.

| Fichier | État |
|---|---|
| `m5a-1-deja-reserve-api-390.png` | Fiche d'un engagement du programme (Tattoo, J1) sur `api` : « Déjà réservé : cette étape ne bouge pas. », ni « Verrouiller », ni « Déplacer », ni « Remplacer » |
| `m5a-2-verrou-conflit-api-390.png` | « Verrouiller » refusé, version dépassée : bandeau `conflict` « Ton programme a changé entre-temps. Regarde la dernière version, puis réessaie. » |
| `m5a-3-verrou-echec-api-390.png` | « Verrouiller » refusé (autre refus ou panne) : bandeau `error` « Impossible d'enregistrer. Réessaie. » |

Références visuelles de la CI : inchangées (elles sont prises sur `mock`, où la fiche ne change pas).
