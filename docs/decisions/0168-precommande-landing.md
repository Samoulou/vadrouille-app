# 0168 — Précommande : la page d'accueil devient la page de prévente

Statut : **proposition du CEO, non tranchée, en attente de Samuel (Q357)**. Le code qu'elle décrit est livré éteint et peut être fusionné ; l'activation en production reste sous conditions (section « Conditions d'activation »).

Date : 2026-11-09, amendée le 2026-11-10 après les revues de la PR #1102 (heads `280c548`, `ef5d033` et `71ccfda`) · Rédacteur : CEO · Répond **en partie** à Q357 (encaissement, conditions), qui reste ouverte. La date d'ouverture (1er février 2027) et les règles de remboursement (point 4) sont **provisoires** jusqu'à la réponse de Samuel.

## Source de la délégation

« Qui décide quoi » (`docs/CONTEXT.md`) réserve à Samuel le prix, l'encaissement réel et la production. Samuel a délégué ces sujets au CEO dans le fil du projet « Livrer le MVP prêt aux précommandes ». Messages de Samuel, mot pour mot (fautes de frappe gardées), avec leur identifiant dans le fil :

- 2026-11-09 22:24:43 UTC (`cmsg_0174CRqum9q8GNfZHmNHcYvRStWJbcJvCf2BPpaSwox395`) : « Par contre maintenant, on tourne avec fable 5.2 a ma demande. Je te donne les pleins pouvoir. On a suffisamment parler pour que tu sache ce que je veux pour cette application. Tu vas me proposer un mvp fonctionnelle, prêt aux précommande pour de faire de l'argent dès le début. Tu es le ceo tu sais créé l'équipe pour mener de projet. »
- 2026-11-09 22:25 UTC, discussion du projet (`cmsg_0174CRqum9q8GNfZHmNHcYvR6UeyLqBVRcstsUtoTofyE5`) : « On veut une lanfinge zone la total hein » (lu : une landing page complète).
- 2026-11-09 22:25:51 UTC (`cmsg_0174CRqum9q8GNfZHmNHcYvRNbABPGcC7t3q8CY2qihEMn`) : « Rien ne demande mes mains du peux tout faire toi même ».
- 2026-11-10 06:30 UTC, même fil : « la landing est pas ouf [...] C'est des font standard sur un fond blanc avec des bouton bleu, on faisait ça en 2001 » (origine de la refonte visuelle, point 6).

Ces messages ne sont pas lisibles depuis le dépôt : un relecteur ne peut pas les vérifier. Pour cette raison, le texte reste une proposition et ne vaut que pour le code livré **éteint** ; rien n'est activé en production sans les conditions ci-dessous, et le CEO reporte la décision dans `QUESTIONS.md` (Q357) par la PR « chore: status », où Samuel peut la confirmer ou la refuser. Le prix (29 CHF) n'est pas décidé ici : c'est celui de `OFFER_CONFIG`, déjà fixé (Q2, 0020 § 4).

## Décision

1. **Interrupteur.** `PREVENTE=1` (exactement) : la page d'accueil affiche l'offre de précommande (`docs/commercial/page-prevente.md`) : prix, garantie, questions fréquentes, bouton « Précommander pour {prix} ». « Créer un voyage » disparaît, le produit n'étant pas ouvert ; la démonstration sur données simulées reste. Sans la variable, rien ne change.
2. **Paiement.** Un lien de paiement hébergé par Stripe (`PREVENTE_LIEN_PAIEMENT`, hôte `buy.stripe.com` seulement, HTTPS, sans identifiants ni port). L'application ne lit aucune clé, ne reçoit aucun webhook et ne garde aucune donnée personnelle : paiement, reçu et adresse e-mail restent chez Stripe. Lien absent ou invalide : page « La précommande ouvre très bientôt », jamais d'erreur. Le prix affiché vient de `OFFER_CONFIG` (0020 § 4) ; le lien Stripe doit porter le même montant.
3. **Provenance.** `?src=` (lettres minuscules, chiffres, tirets, 30 au plus) suit le bouton et part en `client_reference_id` : le compte « hors cercle proche » (0044) se lit dans Stripe.
4. **Conditions affichées.** Ouverture le **1er février 2027** ; remboursement intégral si le voyage complet n'est pas prêt à cette date ; remboursement sur simple demande avant l'ouverture. Prix : 29 CHF (Q2).
5. **Confinement.** Deux lignes nominatives (`src/adapters/prevente.ts` et son test) pour l'hôte du lien, et la lecture des deux variables, non secrètes. Verdict de la Sécurité à la revue de la PR.

6. **Forme de la page.** La page de prévente est un écran hors maquettes (`src/features/accueil/LandingPrevente.tsx`), aux tokens Ligne : fond `ink`, bouton d'appel `quai`, plaques de destination, `DayLine` dans un cadre de téléphone. **Écart au design system** : les titres de cette seule page emploient la police Fraunces (`--font-fraunces`, chargée sans préchargement) ; les autres écrans gardent la police de Ligne. Motif : demande de Samuel du 2026-11-10 ci-dessus. Avis UX/UI attendu à la revue.
7. **Deux écrans sans maquette.** `/precommande` (lien absent : titre « La précommande ouvre très bientôt », une phrase, bouton secondaire « Revenir à l'accueil ») et `/precommande/merci` (titre « Merci », trois phrases, même bouton) : colonne étroite, titres `titre-jour`, composants Ligne existants. La page « Merci » n'affirme pas le paiement (« Si ton paiement a abouti… ») et ne promet aucun e-mail d'accès : l'application ne connaît ni le paiement ni l'adresse de l'acheteur.
8. **Vocabulaire.** Écart au § 10 du handover (« Débloquer ») : les boutons disent « Précommander pour {prix} », comme le propose `docs/commercial/page-prevente.md` (rien n'est débloqué au moment du paiement). Avis UX/UI attendu à la revue ; en cas de refus : « Débloquer le voyage complet pour {prix} » avec la date d'accès dessous.
9. **Remise de l'accès.** À l'ouverture, le CEO écrit aux acheteurs à l'adresse du reçu Stripe, avec la marche à suivre ; la page ne le promet pas tant que l'envoi n'est pas outillé. Tâche à ouvrir avant le 1er février 2027.
10. **En-têtes et mesure.** `/precommande/*` : `Cache-Control: private, no-store`, `Referrer-Policy: strict-origin`, `X-Robots-Tag: noindex, nofollow`. Aucun événement de mesure dans cette PR : le compteur de visites et l'exclusion de `?src=interne` (`docs/commercial/suivi.md`) viennent avec la tâche « questionnaire et compteur ». D'ici là, `src=interne` part en `client_reference_id=src-interne` et s'exclut à la lecture dans Stripe.

## Écarts à `docs/commercial/page-prevente.md`

La page livrée s'écarte de la source sur les points suivants ; chacun est une proposition, à valider par Samuel (Q357), ou à revenir en arrière :

- **Section « destinations » ajoutée** (« Toute l'Europe, jour par jour », quatre exemples : Édimbourg, Lisbonne, Rome, Zakynthos). Ce sont des exemples illustratifs, pas des programmes disponibles ; le texte de la section le dit.
- **« Des remplacements »** au lieu de « Jusqu'à [N] remplacements » : N n'est pas tranché (Q88).
- **Sections ajoutées** : bandeau d'ouverture, trois atouts sous le bouton, cadre de téléphone avec une journée d'exemple (étiquetée « Exemple de journée, pour illustrer »), « Trois gestes, un programme ».
- **Sections omises** : § 2 « Un programme pensé pour être suivi » ; question « Que devient ce que je saisis ? » (elle attend le texte sur les données, condition d'activation) ; boutons « Payer avec TWINT » et « Payer par carte » (le choix se fait sur la page hébergée de Stripe) ; lien « À réserver ».
- **Sous-titre remplacé.** La source dit « Précommande ton voyage complet pour le printemps : 29 CHF, utilisable dès le [DATE D'OUVERTURE] » ; la page affiche un texte de présentation (« Raconte ton voyage en quelques phrases… ») où la « Promesse » de la source est fusionnée. Le prix et la date figurent dans le bouton, le bandeau et le bloc prix.
- **Remboursement sur simple demande avant l'ouverture** : la question « Et si je change d'avis avant l'ouverture ? », l'atout « Remboursé si ce n'est pas prêt » et la phrase de remboursement de la page « Merci » promettent plus que la source, qui ne prévoit pas cette règle (non tranchée). Proposition du CEO, provisoire, en attente de Samuel (Q357) ; la réponse de Samuel est une condition d'activation.
- **Titre principal scindé** en deux lignes (« Ton voyage, » puis « de l'hôtel à la soirée. ») ; réponses des questions fréquentes raccourcies.
- **Titre final** : « Ton printemps se prépare dès le 1er février » au lieu de « dès janvier », pour ne pas contredire la date d'ouverture.
- **Badge du téléphone** : « Objectif : aucun trou dans ta journée », formulé en objectif tant que G0 n'est pas passé.
- **Section « Démonstration »** gardée en fin de page, sur données simulées, avec sa mention.

## Écarts au design system Ligne (écran non maquetté)

**Dérogations proposées, en attente de Samuel (Q357).** Aucune n'est validée par l'UX/UI, qui ne déroge pas aux règles de Ligne : une dérogation revient à Samuel. `docs/design-system/README.md` interdit les capitales, l'italique et le mot isolé en couleur dans un titre (l. 39) et les ombres (l. 45). Le code ne se fusionne donc qu'éteint, comme le dit le statut. Origine : le refus par Samuel de la première forme (message du 2026-11-10 06:30 UTC ci-dessus), puis, sur les captures de la forme actuelle, son message du 2026-11-10 06:50 UTC dans le même fil : « C'est déjà beaucoup mieux ! » (rapporté sans identifiant, non lisible depuis le dépôt).

Outre la police Fraunces (point 6), cette seule page emploie :

- un mot d'accent en italique et en couleur `quai` dans le titre principal ;
- des titres en graisse `font-black` avec `tracking-tight` ;
- des surtitres en majuscules (cadre du téléphone, bloc prix) ;
- des ombres portées (cadre du téléphone, badge, plaques, ticket de prix) ;
- des rotations : cadre du téléphone (`lg:rotate-2`), badge (`-rotate-3`), quatre plaques de destination inclinées sur un même écran ;
- `line` et `quai` comme décor (halos, filet des étapes, badge) et non comme seule couleur d'action ;
- des opacités sur du texte secondaire en fond `ink` ;
- des valeurs hors tokens (`clamp()` pour les titres, rayons du cadre du téléphone, flou des halos) ;
- la section « prix » en forme de ticket (ombre, surtitre en majuscules) ;
- sur les fonds `ink`, un contour de focus en `quai` au lieu de l'anneau `focus` (README l. 68) : `quai` #f6c744 sur `ink` #0e1b30 = 10,8:1, alors que le contour global `line` y est à 2,75:1, sous 3:1.

Le fil « Retirer le look IA du design » reprend ensuite cette page (décision 0170) et peut retirer tout ou partie de ces écarts.

## Conditions d'activation (`PREVENTE=1` en production)

Aucune n'est remplie par cette PR. Toutes sont requises avant de poser la variable :

- **Réponse de Samuel à Q357** sur la date d'ouverture (1er février 2027), sur les règles de remboursement (point 4, y compris le remboursement sur simple demande avant l'ouverture) et sur les dérogations au design system ci-dessus. La page affiche ces conditions comme acquises : elle ne s'allume pas avant (`page-prevente.md`, marqueur « sous réserve »).
- **Mentions du vendeur** sur la page (nom, adresse de contact), conditions de vente et information sur les données : textes à écrire, nom et adresse à fournir par Samuel. *Amendement du 2026-11-10 (ticket 1125)* : les pages existent (`/precommande/mentions-legales`, `/precommande/conditions-de-vente`, `/precommande/donnees`, textes de `docs/commercial/textes-legaux-prevente.md`, non validés) et répondent 404 tant que `PREVENTE` ne vaut pas `1` ou qu'une des variables `VENDEUR_NOM`, `VENDEUR_STATUT`, `VENDEUR_ADRESSE`, `VENDEUR_CONTACT`, `VENDEUR_CONSERVATION`, `TEXTES_LEGAUX_DATE` manque ou est invalide (`docs/deploiement/variables-environnement.md`) ; la condition reste non remplie : valeurs et validation des textes à fournir par Samuel, lien depuis la page de vente à poser.
- **Lien de paiement Stripe** (29 CHF, TWINT et carte, adresse de retour `/precommande/merci`), créé dans le compte de Samuel, **avec les reçus par e-mail activés et une adresse de contact du vendeur sur le reçu** : la page « Merci » et les questions fréquentes y renvoient. Le lien n'est contrôlé que sur son hôte et un chemin non vide : tout compte Stripe passerait, la variable est posée par Samuel ou le CEO seulement.
- **Offre Vercel** : l'offre gratuite interdit l'usage commercial (0163) ; offre payante avant le premier paiement réel, avec l'accord explicite de Samuel pour la dépense.
- Questionnaire en ligne et compteur de visites (seuils de 0044) : demandent une base en production ; ils ne bloquent pas l'activation mais les seuils ne se lisent pas sans eux.
