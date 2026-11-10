# Textes légaux de la prévente — vendeur, conditions de vente, données

Rôle : `commercial` · Ticket #1110 · Rédigé le 2026-11-10.

Statut : **proposition, non relue par un juriste**. Le rôle `commercial` n'est pas juriste. Ces textes décrivent honnêtement ce que la précommande fait ; ils ne garantissent pas la conformité au droit suisse ni au droit de l'Union européenne. Le juridique est réservé à Samuel (`docs/CONTEXT.md`, « Qui décide quoi ») : il valide, fait relire s'il le souhaite, et fournit les informations manquantes. Rien n'est publié avant.

Pourquoi ce document : la décision 0168 (PR #1102, « Conditions d'activation ») interdit de poser `PREVENTE=1` en production sans les mentions du vendeur, les conditions de vente et l'information sur les données.

Sources des faits repris : décision 0168 (prix, date d'ouverture, deux cas de remboursement, lien de paiement Stripe, aucune donnée personnelle dans l'application, provenance `src`) ; `src/server/config/offer.ts` (29 CHF, TWINT et carte, accès 30 jours après le retour) ; `docs/commercial/page-prevente.md` et `offre-prevente.md` (ce qui est inclus) ; `docs/commercial/suivi.md` (visites comptées sans cookie ni identifiant) ; décision 0043 § 4 (aucune intervention humaine) ; décision 0163 (hébergement Vercel).

Mode d'emploi pour le rôle `frontend` :
- Les trois textes ci-dessous sont prêts à coller sur une page du site (proposition : une seule page « Conditions et vendeur », liée depuis le pied de la page de prévente et depuis `/precommande/merci`). Les titres sont ceux à afficher.
- Les emplacements en majuscules entre crochets (`[NOM DU VENDEUR]`, etc.) attendent Samuel. La page n'est pas publiée tant qu'il en reste un.
- Les lignes « Note d'intégration » ne s'affichent pas.
- Le prix et la date viennent de `OFFER_CONFIG` et de la chaîne `ouverture`, pas d'une recopie : ils doivent rester identiques à ceux de la page de prévente et du lien Stripe.
- Le dépôt est public : le nom, l'adresse postale et l'adresse e-mail de Samuel n'y entrent que par sa décision (voir S1).

Règles de rédaction appliquées : `docs/handovers/frontend.md` § 10 (tutoiement, phrases courtes, pas de point d'exclamation, pas d'emoji ; « À réserver »). Le verbe « Précommander » est l'écart au § 10 déjà déclaré par la décision 0168, point 8.

---

## Texte 1 — Mentions du vendeur

### Qui vend Vadrouille

Vadrouille est vendu par [NOM DU VENDEUR], particulier établi en Suisse. Vadrouille n'est pas une société.

Adresse : [ADRESSE POSTALE]

Contact : [ADRESSE E-MAIL DE CONTACT]

Pour toute question sur ta précommande ou pour un remboursement, écris à cette adresse. La même adresse figure sur ton reçu de paiement.

Le paiement est encaissé par Stripe, pour le compte du vendeur.

**Notes d'intégration**
- La phrase « La même adresse figure sur ton reçu » n'est vraie que si l'adresse de contact est réglée dans le compte Stripe (S3). Sinon, la retirer.
- Ne pas ajouter de numéro de téléphone, de numéro d'entreprise ou de numéro de TVA sans réponse de Samuel (V2, V3).

---

## Texte 2 — Conditions de vente de la précommande

### Conditions de vente de la précommande

Version du [DATE DE PUBLICATION].

**1. Ce que tu achètes**

Tu précommandes un « voyage complet » Vadrouille, pour un voyage. C'est un service entièrement numérique. Il comprend :
- toutes les journées de ton voyage, repas et soirées compris ;
- les événements pendant ton séjour ;
- des remplacements pour ajuster ton programme ;
- la liste « À réserver » avant de partir ;
- le calendrier et le partage avec tes proches ;
- l'accès jusqu'à 30 jours après ton retour.

Tout se fait dans l'application. Il n'y a ni rendez-vous, ni appel, ni relecture de ton programme par une personne.

Vadrouille ne réserve rien à ta place. Tu réserves toi-même ce qui est marqué « À réserver ».

Un programme peut contenir des erreurs. Vérifie les horaires, les prix et les réservations avant de partir, surtout ce qui est marqué « À confirmer » ou « Non confirmé ».

**2. Le vendeur**

Le vendeur est [NOM DU VENDEUR], particulier établi en Suisse. Ses coordonnées sont dans « Qui vend Vadrouille ».

**3. Le prix**

Le prix est de 29 CHF, en francs suisses, pour un voyage. C'est un paiement unique, sans abonnement. Aucun frais n'est ajouté par le vendeur.

Si ton moyen de paiement n'est pas en francs suisses, ta banque peut appliquer un taux de change ou des frais. Ils ne dépendent pas du vendeur.

**4. Le paiement**

Tu paies avec TWINT ou par carte, sur une page de paiement hébergée par Stripe. Le prix est débité au moment de la précommande. Stripe t'envoie un reçu par e-mail.

La précommande est conclue quand ton paiement est accepté.

**5. La date d'ouverture**

Le voyage complet est utilisable à partir du 1er février 2027.

À l'ouverture, tu reçois la marche à suivre à l'adresse e-mail donnée lors du paiement. Tu n'as rien à faire avant.

**6. Si le voyage complet n'est pas prêt**

Si le voyage complet n'est pas utilisable le 1er février 2027, tu es remboursé intégralement : 29 CHF. Tu n'as aucune démarche à faire.

**7. Si tu changes d'avis**

Jusqu'au 31 janvier 2027 inclus, tu peux demander le remboursement intégral de ta précommande, sans donner de raison. Écris à [ADRESSE E-MAIL DE CONTACT], depuis l'adresse e-mail utilisée pour le paiement ou en joignant ton reçu.

**8. Comment tu es remboursé**

Le remboursement est fait sur le moyen de paiement utilisé pour la précommande, par Stripe. Il est lancé dans les [14] jours : après ta demande si tu changes d'avis, après le 1er février 2027 si le voyage complet n'est pas prêt. Ta banque ou TWINT peut ensuite mettre quelques jours à l'afficher.

Le remboursement est toujours de 29 CHF. Aucun frais n'est retenu.

**9. Si tu achètes depuis l'Union européenne**

Les droits que la loi de ton pays donne aux consommateurs restent valables, en plus de ces conditions. [PARAGRAPHE SUR LE DROIT DE RÉTRACTATION : à écrire après vérification, voir V5.]

**10. Droit applicable**

Ces conditions sont soumises au droit suisse. Si tu es consommateur, les règles impératives de ton pays de résidence qui te protègent restent applicables. Le tribunal compétent est celui que la loi désigne.

**11. Contact**

Une question, un problème, une demande de remboursement : [ADRESSE E-MAIL DE CONTACT].

**Notes d'intégration**
- Article 1 : la liste reprend `prevente.json`, `prix.inclus`. Elle doit rester identique à celle de la page. « Le calendrier et le partage avec tes proches » promet des fonctions pas encore construites (`src/server/config/offer.ts`, Q128) : si Samuel retire cette ligne de la page, la retirer ici aussi. Le nombre de remplacements n'est pas fixé (Q88) : ne pas en écrire un.
- Article 5, deuxième paragraphe : c'est un engagement d'envoi. La décision 0168 (point 9) le prévoit, mais l'envoi n'est pas outillé et la page « Merci » ne le promet pas. Garder la phrase seulement si Samuel confirme (S5) ; sinon la remplacer par la manière réelle de recevoir l'accès. Une condition de vente sans mode de livraison est incomplète.
- Article 8 : `[14]` est une proposition de délai, à confirmer par Samuel (S4).
- Article 9 : l'article entier attend V5 et la décision de Samuel sur la vente dans l'UE (S6). Si la vente est limitée à la Suisse, supprimer l'article 9 et adapter l'article 10.
- Ces conditions doivent être lisibles **avant** le paiement : lien visible près de chaque bouton « Précommander pour 29 CHF » (V4).

---

## Texte 3 — Information sur les données

### Tes données et la précommande

Version du [DATE DE PUBLICATION].

**Qui est responsable**

[NOM DU VENDEUR], [ADRESSE POSTALE]. Contact : [ADRESSE E-MAIL DE CONTACT].

**Sur ce site**

À ce stade, Vadrouille ne te demande aucune donnée personnelle sur ce site. Il n'y a ni compte, ni formulaire, ni inscription. L'application n'enregistre ni ton nom, ni ton adresse e-mail, ni ton paiement.

Les pages de la précommande ne déposent aucun cookie et n'utilisent aucun traceur publicitaire.

**L'hébergement**

Le site est hébergé par Vercel (Vercel Inc., États-Unis). Pour afficher les pages et protéger le site, Vercel traite des données techniques : ton adresse IP, la date et l'heure, la page demandée, ton navigateur. Ces données peuvent être traitées hors de Suisse et de l'Union européenne, notamment aux États-Unis.

**Le paiement**

Le paiement se fait sur une page de Stripe, pas sur ce site. Stripe reçoit les données que tu y saisis : ton adresse e-mail, les données de ta carte ou de ton paiement TWINT, et les données techniques nécessaires à la sécurité du paiement. Stripe les traite selon sa propre politique de confidentialité, y compris hors de Suisse et de l'Union européenne.

Le vendeur ne voit jamais le numéro complet de ta carte. Dans son compte Stripe, il voit ton adresse e-mail, le montant, la date, le moyen de paiement et, si tu es venu par un lien de diffusion, le nom de ce lien (par exemple « forum »).

**À quoi sert ton adresse e-mail**

Elle sert à quatre choses, et à rien d'autre :
- t'envoyer ton reçu (par Stripe) ;
- t'écrire à l'ouverture pour te donner accès à ton voyage complet ;
- te rembourser ;
- répondre à tes messages.

Elle n'est ni vendue, ni partagée, ni utilisée pour de la publicité.

**Si tu écris au vendeur**

Ton message et ton adresse e-mail sont gardés le temps de te répondre et de traiter ta demande.

**Combien de temps**

Les données de paiement sont conservées chez Stripe. Le vendeur garde les justificatifs de vente pendant la durée exigée par la loi : [DURÉE DE CONSERVATION].

**Tes droits**

Tu peux demander à voir tes données, à les faire corriger ou à les faire supprimer, et tu peux t'opposer à leur utilisation. Écris à [ADRESSE E-MAIL DE CONTACT]. La réponse est gratuite.

Certaines données de paiement doivent être gardées pour des raisons légales, même après une demande de suppression.

Si tu estimes que tes droits ne sont pas respectés, tu peux t'adresser au Préposé fédéral à la protection des données et à la transparence (PFPDT), en Suisse, ou à l'autorité de protection des données de ton pays.

**Paragraphe à ajouter seulement quand le compteur de visites est en service**

*Les visites.* Vadrouille compte le nombre d'affichages de la page de prévente. Ce compte se fait sans cookie et sans identifiant : il ne permet pas de te reconnaître.

**Notes d'intégration**
- « Aucun cookie » : à vérifier par les rôles `frontend` et `securite` sur la page réellement déployée avec `PREVENTE=1` (accueil, `/precommande`, `/precommande/merci`, démonstration) avant publication (V8). L'application pose des cookies ailleurs (accès au prototype, déblocage) : si une page reliée à la prévente en pose un, la phrase doit le dire.
- « Les visites » : la décision 0168 (point 10) ne livre aucun compteur. Le paragraphe n'entre sur la page qu'avec la tâche « questionnaire et compteur », et son texte suit ce qui est réellement mesuré (`docs/commercial/suivi.md`, « Ce qu'est une visite »).
- Le questionnaire en ligne n'est pas couvert par ce texte : il n'existe pas encore. Il lui faudra son propre paragraphe (Q362).
- « L'hébergement » et « Le paiement » : formulations à confirmer (V7), et entité Stripe à préciser d'après le contrat du compte de Samuel (S3).
- Ajouter près de « Le paiement » un lien vers la politique de confidentialité de Stripe, et près de « L'hébergement » un lien vers celle de Vercel (adresses à relever par le `frontend` au moment de l'intégration).

---

## À faire vérifier

Le rôle `commercial` n'est pas juriste. Chaque point ci-dessous est une question ouverte, pas un avis. Les textes ci-dessus sont écrits pour être prudents, pas pour trancher. Recommandation : une relecture juridique légère avant l'activation (prévue par la réserve du budget, cadrage § 11 ; dépense réservée à Samuel).

### Droit suisse

- **V1 — Statut du vendeur.** Un particulier peut-il encaisser ces précommandes sans autre démarche ? À vérifier : statut d'indépendant et annonce à la caisse de compensation (AVS), inscription au registre du commerce (seuil de chiffre d'affaires), déclaration fiscale des recettes, et ce que Stripe exige d'un compte de particulier en Suisse.
- **V2 — TVA suisse.** Le texte dit « 29 CHF » sans mention de TVA. À vérifier : non-assujettissement sous le seuil de chiffre d'affaires, et la mention de prix correcte dans ce cas (ordonnance sur l'indication des prix, OIP : prix à payer effectivement, en francs suisses).
- **V3 — Mentions obligatoires en ligne (LCD, art. 3 al. 1 let. s).** À vérifier que le texte 1 suffit : identité, adresse postale, adresse e-mail. À vérifier aussi les autres exigences de cet article : étapes menant à la conclusion du contrat, moyen de corriger une erreur avant de commander, confirmation de commande sans délai par e-mail (ici, le reçu Stripe : suffit-il ?).
- **V4 — Conditions générales (CO, LCD art. 8).** À vérifier : les conditions sont-elles valablement acceptées par un simple lien près du bouton, ou faut-il une case à cocher ou une mention sur la page Stripe ? Aucune clause ne doit être abusive ; l'article 1 (« un programme peut contenir des erreurs ») limite-t-il la responsabilité de manière admissible ?
- **V5 (volet suisse) — Rétractation.** Le droit suisse ne semble pas prévoir de droit de rétractation général pour la vente en ligne ; le remboursement sur demande avant l'ouverture est alors un engagement volontaire. À confirmer.
- **V6 — Encaisser avant de livrer.** À vérifier : obligations particulières quand le prix est encaissé deux à trois mois avant la livraison (garde des fonds, remboursement si le vendeur ne peut plus rembourser, information de l'acheteur). Les frais Stripe d'un paiement remboursé ne sont en principe pas rendus au vendeur : coût à couvrir par la réserve (cadrage § 11).
- **V7 — Protection des données (nLPD).** À vérifier : le texte 3 remplit-il le devoir d'informer (art. 19 nLPD : responsable, finalités, destinataires, pays de destination) ? Communication à l'étranger (art. 16 nLPD) : sur quelle base les données partent-elles aux États-Unis chez Vercel et Stripe (décision d'adéquation, clauses types) et faut-il la nommer ? Rôles exacts de Stripe (responsable de son propre traitement ou sous-traitant) et de Vercel (sous-traitant), contrats de sous-traitance à accepter dans les deux comptes. Registre des activités de traitement : un particulier en est-il dispensé ?
- **V8 — Cookies et traceurs.** À vérifier techniquement, puis juridiquement : aucune page de la prévente ne dépose de cookie ni ne charge de ressource tierce qui en dépose (polices, carte, Stripe avant le clic). La phrase « aucun cookie » n'est publiée qu'après ce contrôle.
- **V9 — Durée de conservation.** `[DURÉE DE CONSERVATION]` : à fixer. Piste à vérifier : dix ans pour les pièces comptables (CO, art. 958f), si cette obligation s'applique à un particulier ; sinon la durée utile pour les impôts et les litiges.
- **V10 — Âge de l'acheteur.** Les textes ne disent rien de l'âge. À vérifier : faut-il réserver la précommande aux personnes majeures ?

### Acheteurs de l'Union européenne

- **V5 (volet UE) — Droit de rétractation.** La directive 2011/83/UE donne en principe 14 jours pour se rétracter d'un contrat conclu à distance, avec des informations précontractuelles obligatoires et un formulaire type. Trois points à faire trancher :
  1. Le « voyage complet » est-il un service numérique ou un contenu numérique, et quel est le point de départ du délai ?
  2. **Achat tardif.** Le remboursement sur demande s'arrête le 31 janvier 2027. Une personne qui précommande après le 17 janvier 2027 a donc moins de 14 jours. Recommandation à Samuel (offre, donc sa décision) : remboursement sur demande jusqu'à l'ouverture **ou pendant 14 jours après le paiement, selon le délai le plus long**. Non écrit dans le texte 2 tant qu'il n'a pas tranché.
  3. Après l'ouverture, l'accès immédiat à un contenu numérique peut faire perdre le droit de rétractation, mais seulement avec l'accord exprès de l'acheteur et sa reconnaissance de cette perte. Cela concerne la vente après le 1er février 2027, pas ce document, mais l'article 9 doit le prévoir si des précommandes sont utilisées dans les 14 jours.
- **V11 — Bouton de commande.** Le droit de l'UE exige que le bouton indique clairement l'obligation de payer. « Précommander pour 29 CHF » suffit-il ? Le paiement se fait ensuite sur la page Stripe, dont le bouton dit « Payer » : à vérifier.
- **V12 — Droit applicable et tribunal.** L'article 10 choisit le droit suisse en réservant les règles impératives du pays du consommateur (règlement Rome I, art. 6, pour les juges de l'UE ; convention de Lugano pour le tribunal). À confirmer, y compris la formule « le tribunal que la loi désigne ».
- **V13 — TVA de l'UE.** Point fiscal, à vérifier avant toute vente dans l'UE : un service numérique vendu à un particulier de l'UE est en principe soumis à la TVA du pays de l'acheteur, et le seuil d'exonération prévu pour les vendeurs de l'UE ne semble pas s'appliquer à un vendeur établi en Suisse (enregistrement au guichet unique, régime non-UE). Si c'est confirmé, la vente dans l'UE crée une obligation dès le premier achat.
- **V14 — RGPD.** Le RGPD s'applique-t-il au vendeur dès lors que l'offre vise des acheteurs de l'UE (art. 3 par. 2) ? Si oui : mentions supplémentaires dans le texte 3 (base légale de chaque traitement, droit à la portabilité, droit de retirer un consentement), et obligation ou non de désigner un représentant dans l'UE (art. 27, avec son exception pour les traitements occasionnels).
- **V15 — Garantie de conformité.** La directive (UE) 2019/770 sur les contenus et services numériques donne à l'acheteur des droits si le service n'est pas conforme. L'article 9 doit-il les rappeler ?

### Recommandation du rôle `commercial`

Les points V5, V11, V13, V14 et V15 n'existent que si la précommande est vendue dans l'UE. La cible de G0 est en Suisse romande (`docs/CONTEXT.md`, cadrage § 1). Recommandation : **ouvrir la précommande aux acheteurs en Suisse seulement**, le dire dans les conditions, et étendre à l'UE après vérification. C'est une décision de cible et d'offre : elle revient à Samuel (S6). Le texte 2 est écrit pour les deux cas (article 9 à compléter ou à supprimer).

---

## Informations à fournir par Samuel

Aucune n'est inventée dans ce document. Les données nominatives ne sont pas à écrire dans une PR ou un ticket sans décision de Samuel : le dépôt est public.

- **S1 — `[NOM DU VENDEUR]`, `[ADRESSE POSTALE]`, `[ADRESSE E-MAIL DE CONTACT]`.** Nom et prénom, adresse postale où le vendeur peut être joint, adresse e-mail relevée régulièrement. À décider avec : accepter que le nom et l'adresse privée soient publics sur le site et dans le dépôt, ou utiliser une adresse de domiciliation (dépense) ; une adresse e-mail dédiée suppose un compte ou un domaine (ouverture de compte, dépense éventuelle).
- **S2 — `[DATE DE PUBLICATION]`.** La date de mise en ligne des textes, posée à l'activation.
- **S3 — Compte Stripe.** Type de compte (particulier ou indépendant) et nom affiché sur le reçu et le relevé bancaire de l'acheteur ; adresse de contact affichée sur le reçu (la page « Merci » et la FAQ y renvoient) ; entité Stripe du contrat ; moyens ouverts (TWINT, carte) ; pays acceptés par le lien de paiement.
- **S4 — Délai de remboursement.** Confirmer « 14 jours » (article 8) ou donner un autre délai. Confirmer qui lance les remboursements dans Stripe, et celui du cas « pas prêt » pour tous les acheteurs.
- **S5 — Remise de l'accès.** Confirmer l'envoi d'un e-mail à l'ouverture à l'adresse du reçu (décision 0168, point 9), et qui l'envoie, depuis quelle adresse. Jusqu'à quand une précommande peut être utilisée après l'ouverture : aucune durée n'est écrite, donc aucune limite n'est annoncée.
- **S6 — Pays de vente.** Suisse seulement (recommandation ci-dessus) ou Suisse et Union européenne. Dans le second cas : règle pour les achats tardifs (V5, point 2).
- **S7 — Situation fiscale et sociale.** Assujettissement à la TVA (oui ou non), statut d'indépendant, numéro d'entreprise s'il existe : seulement ce qui doit figurer sur la page (V1, V2).
- **S8 — Relecture juridique.** Faire relire ou non ces textes par un juriste avant l'activation, et avec quel budget (dépense réservée à Samuel ; réserve du cadrage § 11).
- **S9 — Durée de conservation** des justificatifs de vente (V9).
