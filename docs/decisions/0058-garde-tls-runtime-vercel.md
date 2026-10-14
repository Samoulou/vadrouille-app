# 0058 — Barrière de sortie sur le runtime de Vercel : diagnostic par nom, exception étroite de `NODE_EXTRA_CA_CERTS`, région des fonctions

Statut : décision déléguée, proposée (architecture, outillage et tests : Tech Lead, « Qui décide quoi » de `docs/CONTEXT.md`) ; **l'exception du § 3 attend l'avis de la Sécurité** (0055, S-1 point 4 : une garde toujours fermée n'est pas corrigée par le retrait ou l'assouplissement d'une condition sans nouvel avis). À lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel **2 jours après sa fusion**. La région des fonctions (§ 5) est une **proposition à Samuel** (coût), hors du régime « sans veto ».

Date : 2026-10-14 · Décideur : Tech Lead (avis Sécurité demandé dans la PR) · Ticket #319 · Amende la règle « TLS affaibli » de `specs/P0-suite-executions-reelles.md` (P0r1, décisions 0031 et 0049) et complète 0055 (section 1, S-1).

## 1. Constat

Relevé de la Sécurité (0055 § 1 point 3, 2026-10-14, préversion `dpl_GtL1iynNFbCsPd9coPAeVx4SZwGG`, `p0-reel` = `6cbee57`) : `/prototype/executions` rend 404, journal `p0.guard_closed` avec `guard: "tls_env_refused"`. La barrière de sortie (`verifierSortie`, `src/server/env/egress.ts`) voit donc, au runtime Node de Vercel, l'une des variables `NODE_TLS_REJECT_UNAUTHORIZED`, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `SSL_CERT_DIR`, `OPENSSL_CONF`, `SSLKEYLOGFILE`, ou l'une des options TLS interdites dans `NODE_OPTIONS` ou `process.execArgv`. Aucune de ces variables n'est posée par le projet. Les fonctions tournent en `iad1` (États-Unis) ; la base Neon est à Francfort (Q24).

## 2. Ce que dit la documentation publique (établi) et ce qu'elle ne dit pas

- **AWS Lambda, runtime Node** ([Building Lambda functions with Node.js, « CA certificate loading »](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html), lu le 2026-10-14) : jusqu'à Node 18, Lambda charge automatiquement des autorités propres à Amazon ; à partir de Node 20, il ne le fait plus par défaut, le runtime contient le fichier `/var/runtime/ca-cert.pem` (toutes les autorités d'Amazon) et **le moyen documenté de rétablir ce chargement est `NODE_EXTRA_CA_CERTS=/var/runtime/ca-cert.pem`**.
- **Vercel** ([Reserved environment variables](https://vercel.com/docs/environment-variables/reserved-environment-variables), même date) : les fonctions reposent sur les runtimes de Lambda (variables réservées `AWS_LAMBDA_*`, `LAMBDA_TASK_ROOT`, `LAMBDA_RUNTIME_DIR`), mais la documentation **ne dit pas** quelle variable TLS le runtime de Vercel pose. Aucune page publique de Vercel ne nomme `NODE_EXTRA_CA_CERTS`.
- **Conclusion** : l'hypothèse « `NODE_EXTRA_CA_CERTS=/var/runtime/ca-cert.pem` posée par le runtime » est **plausible, non établie**. La documentation ne suffit pas : un diagnostic par nom est nécessaire (§ 3), et l'exception (§ 4) est écrite pour ce seul cas, de sorte que le prochain relevé la confirme ou la réfute sans nouvelle livraison.

## 3. Diagnostic : le nom de la cause, jamais une valeur (TL)

1. `verifierSortie(env, execArgv, diagnostic?)` reçoit un **rappel facultatif** ; hors refus de production, il reçoit `{ cause?, exception? }` :
   - `cause` : le **nom** de la première variable ou option qui provoque le refus, dans l'ordre du contrôle (proxy, puis TLS), pris dans la liste fermée `CAUSES_SORTIE` (8 variables de proxy, `--use-env-proxy`, 6 variables de TLS, 10 options TLS ; noms d'option sous leur forme canonique, sans `=valeur`) ;
   - `exception` : `vercel_runtime_ca` si l'exception du § 4 a été appliquée.
   Aucune valeur, aucune longueur, aucun préfixe, aucun booléen sur une valeur autre que l'égalité exacte de l'exception. Les autres appelants (`ai.ts`, `grounding.ts`, `undici-transport.ts`) ne passent pas de rappel : rien ne change pour eux. Aucune seconde lecture : le diagnostic vient des mêmes lectures, dans le même appel.
2. `lireEnvP0` transmet ce rappel ; `src/server/p0/acces.ts` écrit le diagnostic dans la ligne `p0.guard_closed` (champs `cause` et `exception`), là où elle est déjà écrite (actions, et affichage de la page hors production).
3. `src/server/log.ts` admet ces deux champs, chacun contrôlé contre une liste fermée (`LOG_EXIT_CAUSES`, et `vercel_runtime_ca` seul) ; toute autre valeur est **retirée** (`dropped`), jamais écrite. L'égalité `LOG_EXIT_CAUSES` = `CAUSES_SORTIE` est vérifiée par le test de la garde (`tests/unit/p0/garde.test.ts`), sur le modèle de `LOG_GUARD_CODES`.

## 4. Exception étroite : `NODE_EXTRA_CA_CERTS` du runtime (TL ; **avis Sécurité demandé**)

1. **Le cas admis, et lui seul** : `NODE_EXTRA_CA_CERTS` **exactement** égale à `/var/runtime/ca-cert.pem` (comparaison exacte, sans `trim()` ni normalisation), **et** `VERCEL` égale à `1` **et** `VERCEL_ENV` égale à `preview`, **dans l'environnement lu et dans le vrai `process.env`** (D21 de 0046 : l'environnement injecté ne peut que resserrer). La règle de production est contrôlée avant et inchangée.
2. **Refusé, comme avant** : toute autre valeur (autre chemin, espace, retour à la ligne, casse, chemin relatif, `..`, `//`, `/` final, fichier voisin), `VERCEL` absente, vide, `0`, `true` ou `1 `, `development`, et le même chemin dans **toute autre** variable TLS. Une autre variable ou option TLS posée en même temps refuse toujours. Aucune autre exception n'existe ; la barrière n'est ni retirée ni assouplie au-delà de ce cas.
3. **Pourquoi c'est sûr** : `NODE_EXTRA_CA_CERTS` **ajoute** des autorités sans retirer la vérification ; le fichier est celui des autorités d'Amazon, dans l'arborescence du runtime, que la fonction ne peut pas écrire (seul `/tmp` est inscriptible sur Lambda). Les seules autorités ajoutées sont détenues par Amazon, qui exécute déjà la fonction et voit déjà ses clés en mémoire : aucun nouveau tiers de confiance. Ce qui reste interdit est ce qui désactive ou affaiblit la vérification (`NODE_TLS_REJECT_UNAUTHORIZED`, options `--tls-*`, `--openssl-*`), remplace le magasin (`SSL_CERT_FILE`, `SSL_CERT_DIR`, `OPENSSL_CONF`) ou expose les clés de session (`SSLKEYLOGFILE`, `--tls-keylog`).
4. **Risque résiduel, à juger par la Sécurité** : (a) les autorités d'Amazon (dont celles de RDS) deviennent valables pour tout nom d'hôte appelé par les clients réels (OpenRouter, Google) ; (b) si le runtime de Vercel posait ce chemin vers un fichier **différent** de celui d'AWS, la décision reposerait sur une hypothèse fausse ; le relevé du § 6 le dit sans valeur. Les deux sont acceptables pour la préversion de `p0-reel` (derrière la protection Vercel) **si** la Sécurité les accepte ; à réexaminer à la passe de sécurité qui précède la mise en public (0034, point 1).
5. **Portée** : l'exception vaut pour la barrière entière (les quatre modules de capacité), puisque le runtime est le même ; elle ne s'applique qu'en préversion.

## 5. Région des fonctions (proposition à Samuel)

1. **Proposition** : `fra1` (Francfort), au plus près de Neon `aws-eu-central-1` (Q24), par le fichier versionné `vercel.json` (`"regions": ["fra1"]`), plutôt que par le tableau de bord (réglage non relu). Une seule région : elle est permise sur toutes les formules de Vercel ([Configuring regions for Vercel Functions](https://vercel.com/docs/functions/configuring-functions/region) : Hobby, une région ; Pro, jusqu'à 5). Aucun KV ni Edge Config (0002).
2. **Coût** : sur la formule Pro, les tarifs régionaux de `fra1` sont plus élevés que ceux d'`iad1` ([fra1](https://vercel.com/docs/pricing/regional-pricing/fra1), [iad1](https://vercel.com/docs/pricing/regional-pricing/iad1), lus le 2026-10-14 : Fluid Active CPU 0,184 USD/h contre 0,128 ; mémoire provisionnée 0,0152 USD par Go-heure contre 0,0106 ; requêtes CDN 2,60 USD par million contre 2,00). Sur Hobby, ces tarifs ne s'appliquent pas (usage inclus). La formule du compte n'est pas connue du studio.
3. **Donc, hors de cette PR** : le changement engage une dépense potentielle et touche la production ; il **attend la réponse écrite de Samuel** (question ouverte 1). Sur un « oui », une PR d'une ligne ajoute `vercel.json` ; aucun réglage du compte n'est nécessaire (le fichier l'emporte sur la région par défaut du projet), mais Samuel peut préférer le réglage du tableau de bord.
4. Cette PR ne touche ni `vercel.json` ni `.github/`.

## 6. Relevé suivant (Sécurité, 0055 § 1 point 3, après la fusion et un redéploiement de `p0-reel`)

Ouvrir la page de saisie de la préversion de `p0-reel` et lire la ligne `p0.guard_closed` :
- `guard: "tls_env_refused"` avec `cause` : le nom en cause est établi ; si c'est `NODE_EXTRA_CA_CERTS`, la valeur n'est pas le chemin du § 4 (nouvelle décision, jamais d'assouplissement sans avis) ; si c'est un autre nom, nouvelle décision ;
- un autre code avec `exception: "vercel_runtime_ca"` : l'hypothèse du § 2 est **confirmée** et l'exception a servi ; le relevé continue avec (a) `CI` absente et (b) `VERCEL_GIT_COMMIT_REF` égale à `p0-reel` (0055, condition 6 ; ticket #319, point 4), lisibles par les codes `ci_refused` et `branch_refused` ;
- un autre code sans `exception` : aucune variable TLS n'est plus posée ; l'exception n'a pas servi.

## 7. Tests (TL)

`src/server/env/egress.test.ts` : le cas exact admis ; chaque variante voisine refusée (§ 4 point 2) ; l'env injecté ne peut pas ouvrir l'exception (vrai `VERCEL` absent ou `0`, vrai `VERCEL_ENV` `development`) ; l'exception ne masque ni la production ni un proxy ; chaque nom de `CAUSES_SORTIE` posé seul est rendu tel quel et sans sa valeur ; forme canonique des options ; aucun diagnostic en production. `tests/unit/p0/garde.test.ts` : égalité des listes du journal, retrait d'une cause ou d'une exception hors liste, ligne `p0.guard_closed` avec `cause` (sans la valeur sentinelle) puis avec `exception`. Régime de confinement : `VERCEL` ajoutée aux lectures d'`egress.ts` (`tests/unit/confinement/listes/process.ts`), seule ligne nouvelle.

## Questions ouvertes

1. **Samuel** — Région des fonctions : passer de `iad1` à `fra1` par `vercel.json` (§ 5) ? Sur la formule Pro, coût unitaire plus élevé d'environ 40 % sur le calcul et la mémoire des fonctions ; nul sur Hobby. Ne bloque pas la garde ; réduit la latence vers Neon et garde le traitement en UE.
2. **Sécurité** — Avis sur l'exception du § 4 (S-1 point 4) et sur le diagnostic du § 3 (champs `cause` et `exception` du journal). Bloque la fusion de cette PR.
