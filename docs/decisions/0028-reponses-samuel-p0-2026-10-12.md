# 0028 — Réponses de Samuel du 2026-10-12 pour P0 (Q241, Q252, P0-Q5, Q249, Q250, P0-Q8, P0-Q12)

Statut : accepté · Date : 2026-10-12 · Décideur : Samuel (#studio, 2026-10-12 10:35 CEST ; fil du projet Claude « Vadrouille », 2026-10-12 10:49 CEST) · Consigné par le CEO (38e cycle)

Numérotation : 0011 reste réservé par #27 ; 0028 est le prochain numéro libre après 0027.

## Contexte
La décision 0027 (§ « Conséquences ») laissait ouvertes pour Samuel Q249, Q250, Q241, P0-Q5, P0-Q8 et les valeurs des quotas quotidiens (Q252). Samuel y a répondu le 2026-10-12, en deux messages. La spec P0 (#149, `specs/P0-prototype-recherche.md`) les applique déjà ; la revue consolidée du head `0dd05f7` (Tech Lead, bloquant 1) demande qu'elles soient consignées avec date, décideur et source. Cette décision les cite **mot pour mot**, sans les interpréter et sans fixer aucun plafond.

## Décisions (Samuel), citées mot pour mot

### 1. Message du 2026-10-12, 10:35 CEST, Slack #studio
Source : canal #studio, message de Samuel du 2026-10-12 à 10:35 CEST. Citation lue dans le canal par le CEO le 2026-10-12. Seules les lignes qui concernent P0 sont reprises ici, dans l'ordre du message :

> Q249 : clé Google dans tout l'environnement vadrouille, accepté (limitée à Places et Routes, plafonnée).
>
> Q250 : oui, clés OpenRouter et Google seulement en Preview et Development, pas en Production (domaine public).
>
> Q241 : non, aucune donnée Google (horaires compris) dans le dépôt public ; les programmes générés restent hors du dépôt, 30 jours au plus, seuls les identifiants de lieu peuvent y figurer.
>
> Q252 : 100 requêtes par jour et par API pour commencer, alerte budget à 20 USD.
>
> P0-Q5 : OpenRouter hors UE accepté en phase 0 (briefs de test uniquement, aucune donnée client) ; à revoir avant la bêta.

Le même message répond aussi à Q24, Q253, Q254 et Q245 ; ces réponses ne concernent pas P0 et ne sont pas consignées ici.

### 2. Message du 2026-10-12, 10:49 CEST, fil du projet Claude « Vadrouille »
Source : fil « Correction spec P0 » du projet Claude « Vadrouille », message de Samuel du 2026-10-12 à 10:49 CEST. Citation lue dans le fil par le CEO le 2026-10-12 :

> je suis tes reco

Recommandations auxquelles il répond, envoyées par le fil IA-recherche dans le même fil à 10:44 CEST (citées mot pour mot) :

> **P0-Q8** : je te recommande de garder les positions dans le programme hors dépôt 30 jours au plus. Sinon, avec 100 requêtes par jour, une séance ne permet d'afficher qu'environ deux voyages.
>
> **P0-Q12** : il faut décider comment un programme arrive sur ton poste. Je recommande que l'agent le dépose dans le dossier privé du projet Claude. L'autre possibilité est que tu lances toi-même `pnpm p0 --reel`.

Dans la spec P0, ces recommandations correspondent aux options b : **P0-Q8 b**, positions gardées dans le programme hors du dépôt, 30 jours au plus, seules les durées de trajet relues à l'affichage ; **P0-Q12 b**, transfert des programmes par le dossier privé du projet Claude. Entre la recommandation et la réponse, un seul échange a eu lieu (10:47 et 10:48, explication des quotas de Q252), sans nouvelle recommandation.

## Points signalés (aucun n'est tranché ici)
1. **P0-Q12 b contestée par la revue Sécurité.** La revue consolidée du head `0dd05f7` de #149 (bloquant 3, Sécurité) relève que le dossier du projet Claude est relu par les agents : un programme réel (identifiants de lieu, positions, horaires) y entrerait dans le contexte, donc dans un prompt, ce qu'interdit `CLAUDE.md` (« Mettre une donnée Google dans un prompt »). Une question a été posée à Samuel le 2026-10-12 (P0-Q13 dans la spec P0) : exécutions réelles sur son poste, programmes jamais sortis de son poste. Sa réponse peut remplacer P0-Q12 b ; d'ici là, aucune exécution réelle n'a lieu (point 3).
2. **Portée du quota de Q252.** La question « quota de 100 par jour : par méthode ou pour toute l'API Places » est posée à Samuel (P0-Q14 dans la spec P0) (revue du head `0dd05f7`, bloquant 2). La citation du point 1 ne la tranche pas ; cette décision ne fixe aucun plafond.
3. **Découpage de la spec P0 (décision 0030 du Tech Lead, 2026-10-12).** #149 ne garde que P0a1 et P0b1, sans clé. Les exécutions réelles (P0a2, P0a3, P0b2, A5 et les plafonds définitifs) passent dans une spec suivante, écrite après les réponses de Samuel aux points 1 et 2.

## Conséquences
- Les réponses ci-dessus remplacent, pour Q241, Q249, Q250, Q252, P0-Q5, P0-Q8 et P0-Q12, la liste « Restent ouvertes » de la décision 0027.
- Restent ouvertes pour Samuel : P0-Q13 (point 1, exécutions réelles sur son poste, qui peut remplacer P0-Q12 b), P0-Q14 (point 2, portée du quota), P0-Q6 (seuils G0) et Q5 pour sa validation juridique formelle.
- Rien n'est exécuté avec une clé réelle tant que la spec suivante n'est pas fusionnée.

## Quand revoir cette décision
À la réponse de Samuel à P0-Q13 et P0-Q14, avant la bêta (P0-Q5), et à la validation juridique de Q5.
