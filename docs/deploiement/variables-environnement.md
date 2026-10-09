# Variables d'environnement : ce qui ne se pose jamais en production

Note de sécurité (revue de F9a, PR #86). Elle ne crée aucune règle : elle rassemble les gardes déjà fixées par les décisions 0017 (§ 11) et 0020 (§ 2.3, § 5, § 6) pour la personne qui configure un environnement (Vercel, image `docker`, CI).

## À ne jamais poser sur un déploiement de production (ni sur un staging ouvert au public)

| Variable | Ce qu'elle ouvre | Garde dans le code |
|---|---|---|
| `NODE_ENV=development` | Les pages de développement (`/dev/…`, dont `POST /dev/api/simulation`, ouvertes dès que `NODE_ENV` n'est pas `production`) et le paiement simulé (ouvert en `development` et `test`). | `devPagesEnabled` (`src/dev/flags.ts`) n'a **aucune** autre garde ; `paymentDemoAllowed` (`src/adapters/payment-guard.ts`) reste fermé si `VADROUILLE_ENV` ou `VERCEL_ENV` vaut `production`. |
| `VADROUILLE_DEV_PAGES=1` | Les pages de développement sur un build de production (prévue pour les tests Playwright). | `devPagesEnabled` l'accepte même en production ; seule la portée des simulations exige en plus `!isProductionDeployment()`. Ne compter que sur l'absence de la variable. |
| `VADROUILLE_DEMO_PAYMENT=1` | Le paiement simulé (écran 9, `R9-sim`, `R9-retour`, actions de paiement). | Ignorée si `VADROUILLE_ENV` ou `VERCEL_ENV` vaut `production` (le `Dockerfile` pose `VADROUILLE_ENV=production` ; le job `docker` de la CI vérifie la fermeture). |

Dans le dépôt, seuls `playwright.config.ts` (tests sur le build local), `pnpm dev` (`NODE_ENV=development`) et la seconde image du job `docker` (qui vérifie la fermeture) les posent.

## Pourquoi

- Le paiement simulé et les simulations gardent leur état **en mémoire** dans le processus : sur Vercel, cet état n'est pas partagé entre instances (F9-Q6, décision 0020 § 6). La démonstration du paiement n'est fiable qu'en local, en CI et dans l'image `docker`.
- La portée par défaut des simulations partage **une seule organisation simulée** entre tous les visiteurs : un droit simulé posé par l'un serait vu par les autres. Avant toute ouverture publique d'un environnement où le paiement simulé serait ouvert, une session par visiteur (tâche B3) est nécessaire.

## À vérifier avant de modifier un environnement

1. `VADROUILLE_ENV=production` ou `VERCEL_ENV=production` est présent sur tout déploiement de production.
2. Aucune des trois variables du tableau n'est définie (`vercel env ls`, `docker inspect`).
3. `GET /dev/composants`, `GET /voyages/mock_trip_edimbourg/debloquer` et `POST /dev/api/simulation` répondent 404.
