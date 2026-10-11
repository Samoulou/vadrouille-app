# Variables d'environnement du déploiement (Vercel)

Référence pour Samuel, qui seul pose les variables et déclenche les déploiements (`docs/CONTEXT.md`, « Qui décide quoi »). Aucune valeur n'est écrite dans ce dépôt.

## Carte Google Maps (F4, Q3)

| Nom exact lu par le code | Où il est lu | Environnements Vercel |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `src/components/carte/config.tsx` (`readMapConfig`) | Production (déploiement de `main`) et, si voulu, Preview |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | même fichier | mêmes environnements que la clé |

- **Figées au build.** Les variables `NEXT_PUBLIC_*` sont recopiées dans le JavaScript au moment du build. Ajouter ou changer une valeur dans Vercel n'a aucun effet sur un déploiement existant : il faut un **nouveau déploiement** (nouveau commit sur `main`, ou « Redeploy » sans le cache de build dans Vercel).
- **Nom exact.** Sans le préfixe `NEXT_PUBLIC_`, la variable n'arrive jamais au navigateur.
- **Environnement.** L'adresse de démonstration (`vadrouille-app-ten.vercel.app`) sert le déploiement de `main`, que Vercel range dans l'environnement « Production ». Une variable cochée seulement « Preview » ou « Development » n'y est pas lue.
- **Restriction de la clé.** La clé doit accepter le domaine qui sert la page (référents HTTP) et la Maps JavaScript API. Une clé refusée ne donne pas « Carte indisponible » mais « La carte n'a pas pu être chargée » (voir le tableau suivant).

## Lire le message affiché

| Message | Causes possibles dans le code (`src/components/carte/DayMap.tsx`) |
|---|---|
| « Carte indisponible hors ligne. La liste reste utilisable. » | Navigateur hors ligne. |
| « Carte indisponible. La liste contient tout le programme. » | (a) clé ou Map ID absent du build ; **ou** (b) aucune position pour ce jour (`getDayMap` renvoie `null`). Aucun script Google n'est demandé. |
| « La carte n'a pas pu être chargée. La liste contient tout le programme. » + « Réessayer » | Script Google en échec : clé refusée (`gm_authFailure` : référent non autorisé, API non activée, facturation), réseau, ou délai de 10 s dépassé. |

## Vérifier un déploiement sans exposer la clé

1. Ouvrir une page Journée dont le voyage a des positions, par exemple `/voyages/mock_trip_edimbourg/jour/1` : si la carte s'affiche, les deux variables sont dans le build.
2. Autre contrôle : dans les outils du navigateur (onglet Sources ou Réseau), chercher `AIza` dans les fichiers `/_next/static/chunks/…` : présent = la clé est dans le build. Ne jamais recopier la valeur.

## Bug #106 (2026-10-11) : « Carte indisponible » sur la démonstration

- **Constat** : `/voyages/mock_trip_edimbourg_debloque/jour/1` affichait « Carte indisponible. La liste contient tout le programme. ».
- **Ce qui a été vérifié** (2026-10-11, 09:10 UTC, déploiement servi par `vadrouille-app-ten.vercel.app`) :
  - la clé (préfixe `AIza`) et le Map ID sont présents dans le JavaScript servi : les noms sont bons, l'environnement Production les reçoit et le déploiement en cours a été construit après leur ajout ;
  - aucun en-tête `Content-Security-Policy` n'est envoyé : rien ne bloque le script Google ;
  - la page `/voyages/mock_trip_edimbourg/jour/1` (voyage non débloqué) monte la carte, sans état de remplacement ;
  - le message affiché est celui de la cause « indisponible », pas celui d'une clé refusée.
- **Cause** : dans le code. Le voyage débloqué de la démonstration (`mock_trip_edimbourg_debloque`, décision 0013 § 3.6) était déclaré sans positions simulées dans `src/adapters/mock.ts` (question D1-Q3, Q100). `getDayMap` renvoyait `null` et la carte affichait son état de remplacement, avec ou sans clé.
- **Correction** : positions dérivées de celles d'Édimbourg pour le voyage débloqué (`deriveEdimbourgCarte`), sauf le J6 en préparation, comme le prévoit la tâche T6 de la décision 0017 § 13 (proposée dans #65). Test qui reproduit : `src/adapters/mock.test.ts`, « voyage débloqué de la démonstration (bug n° 106) ».
- **Action de Samuel** : aucune variable à changer. Après la fusion, le déploiement automatique de `main` suffit ; vérifier ensuite que la carte du Jour 1 s'affiche sur l'adresse de démonstration.
