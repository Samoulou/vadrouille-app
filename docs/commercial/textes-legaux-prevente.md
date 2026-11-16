# Textes légaux de la prévente — vendeur, conditions de vente, données

Rôle : `commercial` · Ticket #1110 · Rédigé le 2026-11-10, corrigé le même jour après la revue de la PR #1113.

Statut : **proposition, non relue par un juriste**. Le rôle `commercial` n'est pas juriste. Ces textes décrivent honnêtement ce que la précommande fait ; ils ne garantissent pas la conformité au droit suisse. Le juridique est réservé à Samuel (`docs/CONTEXT.md`, « Qui décide quoi ») : il valide, fait relire s'il le souhaite, et fournit les informations manquantes. Rien n'est publié avant.

Pourquoi ce document : la décision 0168 (PR #1102, « Conditions d'activation ») interdit de poser `PREVENTE=1` en production sans les mentions du vendeur, les conditions de vente et l'information sur les données. La décision 0168 n'existe que sur la branche de la PR #1102 : ce document ne fusionne pas avant elle.

**Propositions du CEO, à confirmer par Samuel** (intégrées dans les textes ; chacune reste une décision réservée à Samuel) :
- (a) **Vente en Suisse seulement au départ** : l'offre s'adresse aux personnes domiciliées en Suisse (texte 2, article 2 ; S6).
- (b) **Délai de remboursement : 14 jours** (texte 2, article 9 ; S4).
- (c) **Remise de l'accès : formule prudente**, sans promesse d'e-mail tant que l'envoi n'est pas outillé, comme la page « Merci » (texte 2, article 6 ; S5).

Sources des faits repris : décision 0168 (prix, date d'ouverture, deux cas de remboursement, lien de paiement Stripe, aucune donnée personnelle dans l'application, provenance `src`, condition d'activation « offre Vercel ») ; `src/server/config/offer.ts` (29 CHF, TWINT et carte, accès 30 jours après le retour) ; `src/i18n/fr/prevente.json` de la PR #1102, `docs/commercial/page-prevente.md` et `offre-prevente.md` (ce qui est inclus) ; `docs/commercial/suivi.md` (visites comptées sans cookie ni identifiant) ; décision 0043 § 4 (aucune intervention humaine) ; décision 0163 (`0163-vercel-offre-gratuite.md` : le site est hébergé chez Vercel, et l'offre gratuite interdit l'usage commercial).

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

Vadrouille est vendu par [NOM DU VENDEUR], [STATUT ET LIEU D'ÉTABLISSEMENT DU VENDEUR].

Adresse : [ADRESSE POSTALE]

Contact : [ADRESSE E-MAIL DE CONTACT]

Pour toute question sur ta précommande ou pour un remboursement, écris à cette adresse. La même adresse figure sur ton reçu de paiement.

Le paiement est encaissé par Stripe, pour le compte du vendeur.

**Notes d'intégration**
- `[STATUT ET LIEU D'ÉTABLISSEMENT DU VENDEUR]` : rien dans le dépôt n'établit le statut du vendeur (particulier, indépendant, société) ni son lieu d'établissement. Samuel le fournit (S7), après V1. Exemple de forme, à ne pas reprendre sans sa réponse : « particulier établi en Suisse ».
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
- la liste à réserver avant de partir ;
- le calendrier et le partage avec tes proches ;
- l'accès jusqu'à 30 jours après ton retour.

Tout se fait dans l'application. Il n'y a ni rendez-vous, ni appel, ni relecture de ton programme par une personne.

Vadrouille ne réserve rien à ta place. Tu réserves toi-même ce qui est marqué « À réserver ».

Un programme peut contenir des erreurs. Vérifie les horaires, les prix et les réservations avant de partir, surtout ce qui est marqué « À confirmer » ou « Non confirmé ».

**2. À qui s'adresse l'offre**

La précommande s'adresse aux personnes domiciliées en Suisse. Si tu habites dans un autre pays, ne précommande pas pour l'instant.

**3. Le vendeur**

Le vendeur est [NOM DU VENDEUR], [STATUT ET LIEU D'ÉTABLISSEMENT DU VENDEUR]. Ses coordonnées sont dans « Qui vend Vadrouille ».

**4. Le prix**

Le prix est de 29 CHF, en francs suisses, pour un voyage. C'est un paiement unique, sans abonnement. Aucun frais n'est ajouté par le vendeur.

**5. Le paiement**

Tu paies avec TWINT ou par carte, sur une page de paiement hébergée par Stripe. Le prix est débité au moment de la précommande. Stripe t'envoie un reçu par e-mail.

La précommande est conclue quand ton paiement est accepté.

**6. La date d'ouverture**

Ton voyage complet est utilisable dès le 1er février 2027. Tu prépares alors ton voyage dans l'application, au moment qui te convient.

**7. Si le voyage complet n'est pas prêt**

Si le voyage complet n'est pas utilisable le 1er février 2027, tu es remboursé intégralement : 29 CHF. Tu n'as aucune démarche à faire.

**8. Si tu changes d'avis**

Jusqu'au 31 janvier 2027 inclus, tu peux demander le remboursement intégral de ta précommande, sans donner de raison. Écris à [ADRESSE E-MAIL DE CONTACT], depuis l'adresse e-mail utilisée pour le paiement ou en joignant ton reçu.

**9. Comment tu es remboursé**

Le remboursement est fait sur le moyen de paiement utilisé pour la précommande, par Stripe. Il est lancé dans les 14 jours : après ta demande si tu changes d'avis, après le 1er février 2027 si le voyage complet n'est pas prêt. Ta banque ou TWINT peut ensuite mettre quelques jours à l'afficher.

Le remboursement est toujours de 29 CHF. Aucun frais n'est retenu.

**10. Droit applicable**

Ces conditions sont soumises au droit suisse. Le tribunal compétent est celui que la loi désigne.

**11. Contact**

Une question, un problème, une demande de remboursement : [ADRESSE E-MAIL DE CONTACT].

**Notes d'intégration**
- Article 1 : la liste reprend mot pour mot `prevente.json`, `prix.inclus` (PR #1102). Elle doit rester identique à celle de la page. « Le calendrier et le partage avec tes proches » promet des fonctions pas encore construites (`src/server/config/offer.ts`, Q128) : si Samuel retire cette ligne de la page, la retirer ici aussi. Le nombre de remplacements n'est pas fixé (Q88) : ne pas en écrire un.
- Article 2 : proposition (a) du CEO, à confirmer par Samuel (S6). Le texte ne suffit pas seul : le lien de paiement Stripe doit aussi être réglé pour la Suisse (S3, V16).
- Article 3 : même emplacement que le texte 1 (S7).
- Article 6 : proposition (c) du CEO, à confirmer par Samuel. La phrase reprend la page « Merci » (`merci.suite`) et la FAQ. Elle ne promet aucun e-mail : la décision 0168 (point 9) prévoit un envoi à l'ouverture, mais il n'est pas outillé. Dès que la manière de recevoir l'accès est fixée et outillée, l'écrire ici (S5) : une condition de vente sans mode de livraison reste incomplète (V4).
- Article 9 : « 14 jours » est la proposition (b) du CEO, à confirmer par Samuel (S4).
- Article 10 : **ne pas publier avant V12** (choix du droit et du tribunal : point juridique, non tranché).
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

Le site est hébergé par Vercel (Vercel Inc., États-Unis). Pour afficher les pages et protéger le site, Vercel traite des données techniques : ton adresse IP, la date et l'heure, la page demandée, ton navigateur. Ces données peuvent être traitées hors de Suisse, notamment aux États-Unis.

**Le paiement**

Le paiement se fait sur une page de Stripe, pas sur ce site. Stripe reçoit les données que tu y saisis : ton adresse e-mail, les données de ta carte ou de ton paiement TWINT, et les données techniques nécessaires à la sécurité du paiement. Stripe les traite selon sa propre politique de confidentialité, y compris hors de Suisse.

Le vendeur ne voit jamais le numéro complet de ta carte. Dans son compte Stripe, il voit ton adresse e-mail, le montant, la date, le moyen de paiement et, si tu es venu par un lien de diffusion, le nom de ce lien (par exemple « forum »).

**À quoi sert ton adresse e-mail**

Elle sert à trois choses, et à rien d'autre :
- t'envoyer ton reçu (par Stripe) ;
- te contacter au sujet de ta précommande : son ouverture, un remboursement ;
- répondre à tes messages.

Hors Stripe, qui la reçoit au moment du paiement, ton adresse e-mail n'est partagée avec personne. Elle n'est ni vendue, ni utilisée pour de la publicité.

**Si tu écris au vendeur**

Ton message et ton adresse e-mail sont gardés le temps de te répondre et de traiter ta demande.

**Combien de temps**

Les données de paiement sont conservées chez Stripe. Le vendeur garde les justificatifs de vente pendant la durée exigée par la loi : [DURÉE DE CONSERVATION].

**Tes droits**

Tu peux demander à voir tes données, à les faire corriger ou à les faire supprimer, et tu peux t'opposer à leur utilisation. Écris à [ADRESSE E-MAIL DE CONTACT]. La réponse est gratuite.

Certaines données de paiement doivent être gardées pour des raisons légales, même après une demande de suppression.

Si tu estimes que tes droits ne sont pas respectés, tu peux t'adresser au Préposé fédéral à la protection des données et à la transparence (PFPDT).

**Paragraphe à ajouter seulement quand le compteur de visites est en service**

*Les visites.* Vadrouille compte le nombre d'affichages de la page de prévente. Ce compte se fait sans cookie et sans identifiant : il ne permet pas de te reconnaître.

**Notes d'intégration**
- « Aucun cookie » : à vérifier par les rôles `frontend` et `securite` sur la page réellement déployée avec `PREVENTE=1` (accueil, `/precommande`, `/precommande/merci`, démonstration) avant publication (V8). L'application pose des cookies ailleurs (accès au prototype, déblocage) : si une page reliée à la prévente en pose un, la phrase doit le dire.
- « À quoi sert ton adresse e-mail », deuxième ligne : elle annonce un usage possible (contacter l'acheteur au sujet de sa précommande, comme le prévoit la décision 0168, point 9), pas une promesse d'envoi. Elle suit la réponse de Samuel à S5 : si un e-mail d'accès est outillé, le dire ici en clair ; si l'accès passe par un autre moyen, retirer « son ouverture ».
- « Les visites » : la décision 0168 (point 10) ne livre aucun compteur. Le paragraphe n'entre sur la page qu'avec la tâche « questionnaire et compteur », et son texte suit ce qui est réellement mesuré (`docs/commercial/suivi.md`, « Ce qu'est une visite »).
- Le questionnaire en ligne n'est pas couvert par ce texte : il n'existe pas encore. Il lui faudra son propre paragraphe (Q362).
- « L'hébergement » : la décision 0163 constate que l'offre gratuite de Vercel interdit l'usage commercial ; la décision 0168 exige une offre payante avant le premier paiement réel (« Conditions d'activation », dépense réservée à Samuel). Ce texte ne lève pas cette condition. Formulation et pays de traitement à confirmer d'après le contrat de l'offre retenue (V7).
- « Le paiement » : formulation à confirmer (V7), entité Stripe à préciser d'après le contrat du compte de Samuel (S3).
- Ajouter près de « Le paiement » un lien vers la politique de confidentialité de Stripe, et près de « L'hébergement » un lien vers celle de Vercel (adresses à relever par le `frontend` au moment de l'intégration).

---

## À faire vérifier

Le rôle `commercial` n'est pas juriste. Chaque point ci-dessous est une question ouverte, pas un avis. Les textes ci-dessus sont écrits pour être prudents, pas pour trancher. Recommandation : une relecture juridique légère avant l'activation (prévue par la réserve du budget, cadrage § 11 ; dépense réservée à Samuel).

Les numéros de la première version sont gardés. V11, V13, V14, V15 et le volet européen de V5 et de V12 sont dans « Si la vente s'ouvre à l'UE plus tard ».

- **V1 — Statut du vendeur.** Sous quel statut Samuel peut-il encaisser ces précommandes ? À vérifier : statut d'indépendant et annonce à la caisse de compensation (AVS), inscription au registre du commerce (seuil de chiffre d'affaires), déclaration fiscale des recettes, et ce que Stripe exige du compte en Suisse. La réponse remplit `[STATUT ET LIEU D'ÉTABLISSEMENT DU VENDEUR]`.
- **V2 — TVA suisse.** Le texte dit « 29 CHF » sans mention de TVA. À vérifier : non-assujettissement sous le seuil de chiffre d'affaires, et la mention de prix correcte dans ce cas (ordonnance sur l'indication des prix, OIP : prix à payer effectivement, en francs suisses).
- **V3 — Mentions obligatoires en ligne (LCD, art. 3 al. 1 let. s).** À vérifier que le texte 1 suffit : identité, adresse postale, adresse e-mail. À vérifier aussi les autres exigences de cet article : étapes menant à la conclusion du contrat, moyen de corriger une erreur avant de commander, confirmation de commande sans délai par e-mail (ici, le reçu Stripe : suffit-il ?).
- **V4 — Conditions générales (CO, LCD art. 8).** À vérifier : les conditions sont-elles valablement acceptées par un simple lien près du bouton, ou faut-il une case à cocher ou une mention sur la page Stripe ? Aucune clause ne doit être abusive ; l'article 1 (« un programme peut contenir des erreurs ») limite-t-il la responsabilité de manière admissible ? L'article 6 dit quand le service est utilisable, pas comment l'acheteur y accède : est-ce suffisant tant que S5 est ouverte ?
- **V5 — Rétractation (droit suisse).** Le droit suisse ne semble pas prévoir de droit de rétractation général pour la vente en ligne ; le remboursement sur demande avant l'ouverture est alors un engagement volontaire. À confirmer.
- **V6 — Encaisser avant de livrer.** À vérifier : obligations particulières quand le prix est encaissé deux à trois mois avant la livraison (garde des fonds, remboursement si le vendeur ne peut plus rembourser, information de l'acheteur). Les frais Stripe d'un paiement remboursé ne sont en principe pas rendus au vendeur : coût à couvrir par la réserve (cadrage § 11).
- **V7 — Protection des données (nLPD).** À vérifier : le texte 3 remplit-il le devoir d'informer (art. 19 nLPD : responsable, finalités, destinataires, pays de destination) ? Communication à l'étranger (art. 16 nLPD) : sur quelle base les données partent-elles aux États-Unis chez Vercel et Stripe (décision d'adéquation, clauses types) et faut-il la nommer ? Rôles exacts de Stripe (responsable de son propre traitement ou sous-traitant) et de Vercel (sous-traitant), contrats de sous-traitance à accepter dans les deux comptes. Registre des activités de traitement : le vendeur en est-il dispensé ?
- **V8 — Cookies et traceurs.** À vérifier techniquement, puis juridiquement : aucune page de la prévente ne dépose de cookie ni ne charge de ressource tierce qui en dépose (polices, carte, Stripe avant le clic). La phrase « aucun cookie » n'est publiée qu'après ce contrôle.
- **V9 — Durée de conservation.** `[DURÉE DE CONSERVATION]` : à fixer. Piste à vérifier : dix ans pour les pièces comptables (CO, art. 958f), si cette obligation s'applique au vendeur ; sinon la durée utile pour les impôts et les litiges.
- **V10 — Âge de l'acheteur.** Les textes ne disent rien de l'âge. À vérifier : faut-il réserver la précommande aux personnes majeures ?
- **V12 — Droit applicable et tribunal.** L'article 10 choisit le droit suisse et renvoie au tribunal « que la loi désigne ». À confirmer pour un acheteur consommateur domicilié en Suisse (for du consommateur), et la formule elle-même. L'article n'est pas publié avant.
- **V16 — Limiter la vente à la Suisse.** À vérifier : l'article 2 et un lien de paiement réglé pour la Suisse suffisent-ils à écarter le droit de l'UE ? TWINT est réservé aux comptes suisses, mais une carte étrangère peut payer. Que faire d'un paiement venu d'un autre pays (proposition : le rembourser) ? La page est en français et lisible depuis la France et la Belgique : cela change-t-il la réponse ?

### Si la vente s'ouvre à l'UE plus tard

Hors périmètre tant que la vente est limitée à la Suisse (proposition (a)). À reprendre avant toute ouverture à des acheteurs de l'Union européenne ; le texte 2 devra alors recevoir un article « Si tu achètes depuis l'Union européenne » et l'article 10 réserver les règles impératives du pays de l'acheteur.

- **V5 (volet UE) — Droit de rétractation.** La directive 2011/83/UE donne en principe 14 jours pour se rétracter d'un contrat conclu à distance, avec des informations précontractuelles et un formulaire type. Une précommande passée après le 17 janvier 2027 aurait moins de 14 jours avant la fin du remboursement sur demande : règle à prévoir (« jusqu'à l'ouverture ou 14 jours après le paiement, selon le délai le plus long »). Après l'ouverture, la perte du droit de rétractation pour un contenu numérique suppose l'accord exprès de l'acheteur.
- **V11 — Bouton de commande.** Le droit de l'UE exige que le bouton indique clairement l'obligation de payer. « Précommander pour 29 CHF », puis « Payer » chez Stripe : à vérifier.
- **V12 (volet UE) — Droit applicable et tribunal.** Règles impératives du pays du consommateur (règlement Rome I, art. 6) et tribunal de son domicile (convention de Lugano).
- **V13 — TVA de l'UE.** Un service numérique vendu à un particulier de l'UE est en principe soumis à la TVA du pays de l'acheteur, sans seuil d'exonération connu pour un vendeur établi en Suisse (guichet unique, régime non-UE) : obligation possible dès le premier achat.
- **V14 — RGPD.** Application au vendeur si l'offre vise des acheteurs de l'UE (art. 3 par. 2), mentions supplémentaires dans le texte 3 (base légale, portabilité, autorité du pays de l'acheteur), représentant dans l'UE (art. 27).
- **V15 — Garantie de conformité.** Directive (UE) 2019/770 sur les contenus et services numériques.

Motif de la proposition (a) : la cible du MVP est en Suisse romande (`docs/CONTEXT.md`, « Le produit », ligne « Cible du MVP : couples francophones (Suisse romande) »), et ces six points disparaissent tant que l'UE n'est pas ouverte.

---

## Informations à fournir par Samuel

Aucune n'est inventée dans ce document. Les données nominatives ne sont pas à écrire dans une PR ou un ticket sans décision de Samuel : le dépôt est public.

- **S1 — `[NOM DU VENDEUR]`, `[ADRESSE POSTALE]`, `[ADRESSE E-MAIL DE CONTACT]`.** Nom et prénom, adresse postale où le vendeur peut être joint, adresse e-mail relevée régulièrement. À décider avec : accepter que le nom et l'adresse privée soient publics sur le site et dans le dépôt, ou utiliser une adresse de domiciliation (dépense) ; une adresse e-mail dédiée suppose un compte ou un domaine (ouverture de compte, dépense éventuelle).
- **S2 — `[DATE DE PUBLICATION]`.** La date de mise en ligne des textes, posée à l'activation.
- **S3 — Compte Stripe.** Type de compte et nom affiché sur le reçu et le relevé bancaire de l'acheteur ; adresse de contact affichée sur le reçu (la page « Merci » et la FAQ y renvoient) ; entité Stripe du contrat ; moyens ouverts (TWINT, carte) ; lien de paiement réglé pour la Suisse.
- **S4 — Délai de remboursement.** Confirmer « 14 jours » (proposition (b) du CEO, article 9). Confirmer qui lance les remboursements dans Stripe, et celui du cas « pas prêt » pour tous les acheteurs.
- **S5 — Remise de l'accès.** Confirmer la formule prudente de l'article 6 (proposition (c) du CEO). Dire comment l'acheteur recevra l'accès à l'ouverture (e-mail à l'adresse du reçu, décision 0168 point 9 : qui l'envoie, depuis quelle adresse), pour l'écrire dès que c'est outillé. Jusqu'à quand une précommande peut être utilisée après l'ouverture : aucune durée n'est écrite, donc aucune limite n'est annoncée.
- **S6 — Pays de vente.** Confirmer la vente en Suisse seulement au départ (proposition (a) du CEO, article 2), et la conduite à tenir pour un paiement venu d'un autre pays (V16).
- **S7 — `[STATUT ET LIEU D'ÉTABLISSEMENT DU VENDEUR]` et situation fiscale.** Statut (particulier, indépendant, société), lieu d'établissement, assujettissement à la TVA (oui ou non), numéro d'entreprise s'il existe : seulement ce qui doit figurer sur la page (V1, V2).
- **S8 — Relecture juridique.** Faire relire ou non ces textes par un juriste avant l'activation, et avec quel budget (dépense réservée à Samuel ; réserve du cadrage § 11).
- **S9 — Durée de conservation** des justificatifs de vente (V9).
