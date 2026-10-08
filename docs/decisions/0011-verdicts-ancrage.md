# 0011 — Verdicts d'ancrage et contenu admis dans l'état des workflows

Statut : proposé · Date : 2026-10-08 · Décideur : Tech Lead (architecture, délégation « Qui décide quoi » ; la conservation durable des verdicts reste soumise à Samuel, Q29 sous réserve de Q5) · Définitif sans veto de Samuel avant le 2026-10-10

## Contexte
La spécification B0 (§ 8) fixe une énumération fermée de verdicts (`compatible`, `écarté`, `fermé définitivement`) et laisse au Tech Lead les identifiants exacts. Les revues de la PR #20 demandent : d'harmoniser identifiants et critère, de préciser le sens de chaque verdict et leur recouvrement, de dire si une durée de trajet de Routes API peut transiter dans l'état d'une étape, et d'inscrire l'énumération et l'extension du test de sortie dans une décision.

## Décision
**Énumération `GroundingVerdict`** (type serveur de `src/grounding`, jamais exposé à l'interface) :
| Identifiant | Nom dans les documents | Sens |
|---|---|---|
| `compatible` | compatible | Le candidat est résolu en un seul identifiant de lieu dans la zone du séjour et n'est pas fermé définitivement : il est sélectionnable (R1). Les horaires ne sont pas jugés ici : le moteur les contrôle à la planification (R4) et marque l'étape « à confirmer » si besoin. |
| `discarded` | écarté | Le candidat n'est pas résolu : aucun résultat, plusieurs lieux possibles sans départage, ou lieu hors de la zone du séjour. |
| `closedPermanently` | fermé définitivement | Le candidat est résolu, mais notre contrôle conclut qu'il est fermé définitivement : il est écarté (R1). |

Les trois verdicts sont exclusifs et couvrent tous les cas : une étape d'ancrage renvoie exactement un verdict par candidat. `closedPermanently` est **notre conclusion**, distincte du statut brut de Google (que nous ne recopions pas) ; il est gardé à part de `discarded` parce qu'il alimente la mesure du taux d'ancrage et les signalements, et parce qu'un candidat résolu puis fermé ne doit pas être recherché à nouveau dans le même voyage. Un candidat fermé temporairement pendant le séjour reste `compatible` : le moteur le traite par R4.

**Contenu admis dans l'état sérialisé d'une étape** : identifiants internes, `placeId`, un `GroundingVerdict`, la date de notre contrôle (`checkedAt`, date ISO), des compteurs, des codes d'erreur et l'identifiant de la version produite. Rien d'autre en fait de lieu.

**Durées de trajet** : aucune durée, distance ni matrice issue de Routes API ne transite dans l'état d'une étape. L'étape de planification interroge Routes API à l'intérieur de l'étape, écrit la version produite en base (`Segment.minutes`, provisoire, suit Q5, décision 0010) et ne renvoie que l'identifiant de version.

**Extension du test de sortie du cadrage § 9** (signalée comme telle) : « un dépassement de quota conserve le dernier programme valide » vaut aussi pour un plafond de coût atteint, et aucune version partielle n'est publiée. Test nommé `workflows: plafond ou quota atteint conserve le dernier programme valide`.

**Test nommé `workflows: aucune donnée Google dans l'état sérialisé`** : pour chaque étape de chaque workflow, l'entrée et la sortie sérialisées sont validées par leur contrat strict ; tout verdict appartient à l'énumération ; aucune clé interdite n'apparaît, à aucun niveau : `rating`, `userRatingCount`, `openingHours`, `regularOpeningHours`, `currentOpeningHours`, `businessStatus`, `priceLevel`, `photos`, `phone`, `nationalPhoneNumber`, `internationalPhoneNumber`, `address`, `formattedAddress`, `displayName`, `reviews`, `lat`, `lng`, `latitude`, `longitude`, `location`, `viewport`, `duration`, `staticDuration`, `distanceMeters`, `polyline`.

## Conséquences
- La conservation durable des verdicts (dans l'état des workflows et dans `candidates.grounding_verdict`) est **provisoire, sous réserve de Q5** ; Q29 (Samuel) reste ouverte et n'est pas tranchée ici.
- Le critère de la spécification B0 cite les noms en français ; le handover donne les deux colonnes ci-dessus pour lever l'ambiguïté signalée en revue.
