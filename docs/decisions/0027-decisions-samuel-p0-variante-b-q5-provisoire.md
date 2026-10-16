# 0027 — Orientation de P0 (variante B), plafonds, règle provisoire Q5 et décisions de Samuel du 2026-10-12

Statut : accepté · Date : 2026-10-12 · Décideur : Samuel (#studio, 2026-10-12 09:46 et 09:53 CEST) · Consigné par le CEO (38e cycle)

Numérotation : 0026 est consignée par le CEO (37e cycle) et jointe à #149 ; 0011 reste réservé par #27. 0027 est le prochain numéro libre.

## Contexte
La spécification P0 (#149, ticket #147) et l'état du 37e cycle posaient à Samuel les questions Q234 (P0-Q2), Q235 (P0-Q3, P0-Q4), Q236 (P0-Q6, P0-Q7) et Q237 (#27), et rappelaient Q5, Q214, Q186 à Q188, Q194, Q197, Q48, Q27 et Q129. Samuel a répondu dans #studio le 2026-10-12 à 09:46 CEST, puis a envoyé ses briefs et ses incontournables à 09:53 CEST.

## Décisions (Samuel)

### 1. Orientation de P0 : variante B
1. **DeepSeek** (`deepseek/deepseek-v4.1-flash`) cherche les candidats sur le web à partir du brief.
2. Le code les **ancre dans Google** (existence, horaires, position).
3. *(Amendée par 0076 : la notation utilise `deepseek/deepseek-v4.1-flash`, le Decider n'étant pas un modèle de conversation.)* Le **Decider** (`perplexity/pplx-decider-v1.1-27b`) note chaque candidat ancré : correspond aux envies (oui ou non), risque de « Pas pour moi » (1 à 10), incontournable (oui ou non), adapté au créneau (activité, repas, soirée).
4. Le code **classe** avec ces notes et le coût de trajet du cadrage § 3.7.
5. DeepSeek **rédige les raisons** des seuls lieux retenus.

Règles :
- le Decider ne reçoit que nos descriptions issues de la recherche, **jamais de données Google** ;
- fournisseurs OpenRouter restreints (aucun entraînement sur les données, 0026) ;
- modèles choisis **par configuration**.

Mesure de référence : la **variante A** (DeepSeek seul) est mesurée une fois : taux de « Pas pour moi », R1 à R10, coût et temps par voyage. Si B n'apporte rien de mesurable, le Tech Lead peut revenir à A par une décision écrite.

### 2. Plafonds (Q234, P0-Q2)
- Pas de clé Anthropic : les modèles passent par OpenRouter (0026).
- **40 USD par mois sur OpenRouter**, **20 USD par mois sur Google**, **quotas journaliers plafonnés** (console Google). Les valeurs exactes des quotas quotidiens et le plafond de 3 USD par exécution proposé par la spec ne sont pas cités par Samuel : la spec garde les valeurs proposées comme provisoires et les signale.

### 3. Exécution et consultation protégées (Q235, P0-Q4)
Oui : exécution et résultats du prototype protégés, staging derrière l'authentification Vercel, **rien de public**.

### 4. Règle provisoire pour Q5 (juridique)
Lecture stricte du cadrage : **aucune donnée Google dans les prompts, seul l'identifiant de lieu stocké, coordonnées gardées 30 jours au plus**. La validation juridique formelle viendra avant le lancement. Q5 reste ouverte pour cette validation ; le studio applique la règle provisoire d'ici là.

### 5. PR #27 (Q237)
#27 est **gardée** et finalisée sur la base de la règle provisoire du point 4.

### 6. Autres réponses
- **Q214** : risque accepté en phase 0 ; la parade est à revoir avant l'ouverture au public.
- **Q186, Q187, Q188, Q194, Q48, Q27, Q129** : recommandations du studio validées.
- **Q197** : oui, mention à l'écran 2 que le récit est envoyé au fournisseur d'IA.
- **Q236 (P0-Q7)**, message de 09:53 : les 10 incontournables d'Édimbourg et 3 briefs de référence (6 jours, 2 adultes, à pied et transports) :
  - incontournables : château d'Édimbourg, Royal Mile, Arthur's Seat et Holyrood Park, Calton Hill, Dean Village, Victoria Street et Grassmarket, National Museum of Scotland, Princes Street Gardens et Scott Monument, Royal Botanic Garden, Leith et The Shore ;
  - brief 1 : « On aime bien manger, goûter les boissons du coin, se balader en ville et un peu d'histoire. Pas trop de musées. Une distillerie accessible en train serait top. » ;
  - brief 2 : « On voyage tranquille : culture, histoire, beaux intérieurs, pas plus de deux visites par jour, et de bonnes tables le soir. » ;
  - brief 3 : « Budget serré, on aime marcher, la nature et les points de vue ; on mange simple et local, rien de cher. »
- **T10** (actions manuelles) : prompts Revue et Release collés, libellés `sev:1` et `sev:3` créés, connecteur Vercel reconnecté sur « Sam's projects » (Q120, Q184 et l'accès Vercel des routines).

## Conséquences
- La spec P0 (#149) décrit le pipeline de la variante B, la mesure de référence de la variante A, les plafonds du point 2, les briefs et incontournables du point 6, et la protection du point 3.
- La PR #27 est finalisée sur la règle provisoire du point 4 (Q29, Q34, Q38 et Q44 la suivent), sans attendre la validation juridique formelle.
- ~~Restent ouvertes pour Samuel : Q249 (portée de la clé Google), Q250 points 2 et 3 (clés limitées à Preview et Development), Q241 (horaires planifiés commités), Q245, P0-Q5 (OpenRouter hors UE pour P0), P0-Q6 (seuils G0), P0-Q8, les valeurs des quotas quotidiens.~~ Répondues le 2026-10-12 (voir 0028), sauf P0-Q6 ; Q245 est signalée dans 0028 sans y être consignée.
- Suite : voir 0028 (réponses de Samuel du 2026-10-12 à 10:35 et 10:49).

## Quand revoir cette décision
Après la mesure comparée des variantes A et B (Tech Lead), à la validation juridique de Q5, ou avant l'ouverture au public (Q214).
