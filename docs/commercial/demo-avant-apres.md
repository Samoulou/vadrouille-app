# Démonstration avant/après — script

Rôle : `commercial` · Spécification : `specs/C1-prevente.md` (livrable 5) · Rédigé le 2026-10-13.

Base : la démonstration commerciale du cadrage § 5 (« un avant/après issu du benchmark : une journée trop chargée devient un programme adapté en quelques actions, avec un rendez-vous conservé ») et le benchmark du cadrage § 2. Réalisée par Samuel lui-même, sans aucun testeur ni entretien (décision 0043 § 4).

## Le brief (identique des deux côtés)
Voyage vécu par Samuel, dont la réalité terrain est connue (cadrage § 2, « Benchmark ») : **Édimbourg, du 29 août au 3 septembre 2026**, arrivée à midi, Tattoo le samedi à 21:30, excursion dans les Highlands, distillerie accessible en transports publics. Deux adultes, à pied et en transports (briefs de référence, décision 0027, Q236).

Texte à coller tel quel dans les deux outils (le même mot pour mot) :

> Nous sommes deux adultes et partons à Édimbourg du 29 août au 3 septembre 2026. Nous arrivons à midi le premier jour. Nous avons des billets pour le Tattoo le samedi à 21:30. Nous voulons une journée dans les Highlands et visiter une distillerie accessible en transports publics. Nous nous déplaçons à pied et en transports. Nous aimons la bonne cuisine locale, les balades et les quartiers authentiques. Propose-nous un programme jour par jour avec restaurants et soirées.

Règle : le brief est le texte de Samuel. Il ne contient aucune donnée Google (`CLAUDE.md`, « Jamais »).

## Les deux côtés
- **Avant** : un assistant généraliste (cadrage § 2 cite ChatGPT, Gemini relié à Google Maps, Google AI Mode, Kayak AI ; vérifié le 6 octobre 2026, sources [21, 22] du cadrage). Proposition : un seul, le plus utilisé par la cible, à choisir par Samuel ; conversation neuve, sans historique ni personnalisation.
- **Après** : Vadrouille, sur le même brief. Deux possibilités :
  1. tant que les exécutions réelles du prototype ne sont pas faites (P0a2, `docs/roadmap.md`, ligne P0) : le voyage de démonstration sur données simulées (`specs/D1-demo.md`), **avec la mention « Données simulées. Les lieux entre crochets ne sont pas vérifiés. »** sur chaque capture ;
  2. dès qu'un programme réel d'Édimbourg existe (P0a2 ou suite) : ce programme, après sa séance de jugement (grille G0, Q236).

## Les quatre points de différence (cadrage § 2)

| Point | Ce qu'on vérifie dans l'« avant » | Ce qu'on montre dans l'« après » | Grille du benchmark (cadrage § 2) |
|---|---|---|---|
| **Fiabilité** | Lieux inexistants ou fermés, horaires faux ou absents, trajets irréalistes. Chaque lieu est contrôlé par Samuel sur sa propre expérience du voyage et sur la source officielle du lieu. | Fiche étape (écran 13) : source et date de vérification ; badge « À confirmer » seulement pour les exceptions (§ 3.2). | lieux inexistants ou fermés ; trajets irréalistes |
| **Sélection** | Liste de lieux connus et bien notés, sans raison propre au couple. | « Pourquoi pour toi » et source sur chaque proposition (écran 6) ; repas choisis par créneau (écran 8). | pertinence des restaurants (1–5) |
| **Actualité** | Événements datés pendant le séjour : présents, exacts, ou inventés ? Tattoo placé le samedi à 21:30 ? | Bloc « Pendant ton séjour » (§ 3.4) ; Tattoo en étape verrouillée (§ 3.2, engagements) ; « Non confirmé » quand la source manque. | contrainte horaire fixe respectée ; événements datés corrects |
| **Adaptation** | Demander : « Cette visite ne me tente pas, je préfère une dégustation, mais je veux garder mon restaurant à 19 h. » Compter les messages et vérifier ce qui a bougé. | Remplacer (écran 14) : raison, proposition, ce qui change et ce qui ne bouge pas, Appliquer ; le dîner reste à 19:00. | nombre d'actions pour remplacer une activité en conservant le dîner |

L'exemple de l'adaptation est celui du cadrage § 3.4 (« Exemple de référence »).

## Déroulé (pour Samuel, environ une heure)
1. Coller le brief dans l'assistant généraliste ; enregistrer la réponse complète (texte) hors du dépôt.
2. Relever, pour la journée la plus chargée, chaque écart de la grille : lieu, problème, preuve. Ne garder que des écarts vérifiables.
3. Faire la demande de remplacement ; compter les échanges ; noter si le dîner a bougé.
4. Ouvrir Vadrouille sur le même voyage ; parcourir Tes premières propositions, le Séjour, la Journée, une Fiche ; faire le même remplacement ; compter les actions.
5. Produire les captures ci-dessous.
6. Écrire la page de comparaison : une ligne par point, sans exagérer. Si l'assistant généraliste fait aussi bien sur un point, le dire ou retirer ce point de la page.

## Captures à produire (format mobile 390 × 844, comme les PR d'écran du handover, annexe B)

| # | Avant | Après |
|---|---|---|
| 1 | La journée la plus chargée de la réponse de l'assistant, avec un écart surligné | La même journée dans Vadrouille (écran 12, Journée) : étapes, trajets, temps libre |
| 2 | Le samedi : le Tattoo à 21:30 est-il respecté ? | Le samedi avec le Tattoo verrouillé |
| 3 | Un restaurant sans raison ni source | Une proposition (écran 6) avec « J'aime / Pas pour moi » et sa raison |
| 4 | La demande de remplacement et sa réponse | Remplacer (écran 14) : ce qui change, ce qui ne bouge pas, dîner à 19:00 |

Captures existantes réutilisables comme point de départ : `docs/ux/captures/` (dossiers D1, F5, F6, F7a), issues des données simulées.

## Points à vérifier avant publication
- **Données Google** : une capture de Vadrouille qui montre des données de lieux Google ne peut être diffusée que sur la carte Google ou avec attribution (`docs/CONTEXT.md`, « Principes techniques » 2 ; `CLAUDE.md`). Avant publication de captures d'un programme réel, avis du rôle `securite` : **à vérifier**. Les captures sur données simulées ne posent pas cette question.
- **Conditions de l'assistant généraliste** : publier une capture de sa réponse dans une publicité : conditions d'utilisation **à vérifier** par Samuel (juridique, réservé à Samuel).
- **Honnêteté** : la page ne présente jamais une capture simulée comme un résultat réel, et ne publie aucun chiffre de fiabilité tant que la grille G0 du prototype (Q236) n'est pas passée.
