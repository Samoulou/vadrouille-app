# 0109 — Temps de trajet relus à l'affichage conservés (amende 0092 § 1 et § 4)

Statut : **acceptée** · **décision déléguée du Tech Lead** (mécanisme : architecture, droits, tests ; « Qui décide quoi » de `docs/CONTEXT.md`) ; définitive dès sa fusion, sans délai de veto (décision 0093) ; à lister dans la note de version suivante (rubrique « Décisions prises par le studio »). Elle applique la **règle de Samuel** de 0092 (« on sauvegarde les temps […] on consomme pour rien là, juste pour voir les voyages et l'afficher », 2026-10-18 17:57 UTC ; carte « Garder les temps », 17:59 UTC), que Samuel a rappelée dans le ticket #587 ; elle ne la change pas. Elle n'engage ni argent nouveau, ni compte externe, ni donnée personnelle, ne lève aucune garde, ne touche aucun plafond et n'affaiblit ni ne supprime aucun test. **Verdict Sécurité demandé** dans la PR (§ 6).

Date : 2026-10-20 · Décideur : Tech Lead · Ticket : #587 · Décisions liées : 0011, 0027, 0046 D16, 0079, 0090, 0092

Numérotation (relue le 2026-10-20 sur `main` `9a5d2c5`) : `main` porte 0001 à 0108 ; aucune PR ouverte ni aucune branche `claude/…` ne porte un 0109.

**Amende, sans les réécrire :**
- **0092 § 1**, première phrase (« calculés par Routes **pendant cette exécution** ») : s'y ajoutent les temps **relus à l'affichage** d'un programme de `p0Run` (§ 1 ci-dessous) ;
- **0092 § 1 point 7** (« Un seul écrivain : l'étape finale de `p0Run`. La relecture n'écrit jamais ») : deux écrivains, l'étape finale et la conservation après relecture (§ 2) ; le relecteur (`src/server/p0/relecture.ts`) n'écrit toujours jamais ;
- **0092 § 4 point 4** (« la relecture n'écrit jamais les temps qu'elle obtient […] un programme ancien reste relu à chaque affichage […]. Écart accepté ») : l'écart est **levé** ; un temps relu avec succès est conservé une fois, et un programme ancien n'est plus relu, pour ses paires conservées, après son premier affichage réussi ;
- **0092 « Conséquences »**, deuxième point (« Les programmes écrits avant la migration restent relus à chaque affichage ») : remplacé par le § 5 ci-dessous ;
- les commentaires de `src/adapters/prototype.ts` et de `src/server/p0/relecture.ts` qui disent « seule l'étape finale de `p0Run` écrit les temps » (mis à jour dans la même PR).

**N'amende pas** : 0092 § 1 points 1 à 6 (bornes reprises au § 1), § 2 (prototype seulement), § 3 (table, droits, purge : **aucune migration, aucun `GRANT`**), le reste du § 4 (lecture avec le programme, relecture des seules paires manquantes, dégradation sans état d'erreur), § 5, § 6, § 7 et l'amendement 1 ; 0011 § 2 à § 4 et § 7 (aucune donnée Google dans un prompt, un journal, une trace ou un état de workflow) ; 0046 D16 point 8 (purge de moins de 24 h exigée avant chaque appel du relecteur) ; les plafonds, la réservation et la cadence de la relecture (0053, 0079, 0088, Q330) ; tout le MVP.

## Contexte

Samuel a demandé le 2026-10-20 (fil « Routine cycle du studio ») si l'affichage d'un voyage généré consomme encore ses quotas. Lecture du code de `p0-reel` (ticket #587) : les programmes écrits avant la migration `0011_trajets_prototype` n'ont aucun temps conservé ; à chaque affichage, `durees` (`src/adapters/prototype.ts`) relit les paires manquantes par Routes (`src/server/p0/relecture.ts`), réserve 0,20 USD par journée relue (0079) et ne garde jamais le résultat (0092 § 4 point 4). Les mêmes paires sont donc relues et refacturées à chaque affichage, ce que la règle de Samuel voulait éviter.

## Ligne « Jamais » de `CLAUDE.md` : couvre le cas (confirmé)

Texte en vigueur : « stocker autre chose que l'identifiant d'un lieu Google (exceptions : […] ; **pour le prototype seulement, les temps de trajet Routes d'un programme de `p0Run`, côté serveur dans le schéma `prototype`, supprimés avec le programme, décision 0092**) ». Un temps relu à l'affichage est un temps de trajet Routes **entre deux lieux d'un programme de `p0Run`**, écrit côté serveur dans `prototype.trajets` (schéma `prototype`), avec l'expiration du programme et supprimé par la même purge. Le texte ne restreint ni le moment du calcul ni l'écrivain : ces restrictions (« pendant cette exécution », « un seul écrivain ») sont des **bornes du Tech Lead** dans 0092 § 1 (« règle de Samuel, bornée par le Tech Lead »), que cette décision amende. La ligne de `CLAUDE.md` n'est **pas modifiée** (réservé à Samuel) ; son renvoi « décision 0092 » se lit avec 0109, qui amende 0092.

## Décision

### 1. Ce qui est conservé, et ses bornes (toutes celles de 0092 § 1)

Sont conservés, en plus des temps de l'exécution : les temps **relus à l'affichage avec succès** d'une paire d'un programme de `p0Run`, servi par la source des programmes réels (`src/adapters/prototype-lecture.ts`). Pour chacun : le programme, le mode, l'identifiant de lieu de départ, celui d'arrivée, les minutes. Rien d'autre.

1. **Côté serveur seulement**, dans la table existante `prototype.trajets` (schéma `prototype`, base Neon) ; jamais dans `prototype.programmes.contenu`, un cache, un fichier, le navigateur, un journal, une trace ou un état de workflow.
2. **Expiration copiée du programme** par le déclencheur existant (`prototype.trajets_set_values`, jamais fournie par l'appelant), donc au plus 29 jours après le début de l'exécution, et moins de 30 jours après l'obtention du temps ; **supprimés par la purge existante** (`prototype.purge_expired()`, `p0-purge.yml`), sans nouveau chemin de purge. Un programme expiré entre la lecture et l'écriture : le déclencheur refuse, rien n'est écrit.
3. **Jamais dans un prompt**, jamais sur une carte autre que Google (affichés seulement dans la ligne du jour et le trajet d'une proposition, comme aujourd'hui), **jamais journalisés** (aucune valeur, aucun identifiant de lieu ni de programme, même en cas d'échec).
4. **Minutes entières** : la valeur rendue par le relecteur, `Math.ceil(secondes / 60)` (0090 § 2, seul arrondi de la relecture), entier entre 0 et 1 440 (`minutesTrajetValides`, même fonction que l'écriture de l'exécution) ; une valeur hors bornes est affichée comme aujourd'hui mais **n'est pas écrite**.
5. **Un seul mode par temps**, celui dans lequel Routes l'a calculé : le relecteur demande chaque paire dans son propre mode (`PaireTrajet.mode`, une matrice par mode et par origine), et la ligne porte ce mode. Jamais des minutes d'un mode servies sous l'étiquette d'un autre. Une paire qu'0092 § 1 point 5 écartait à l'exécution (mode différent de celui de l'exécution, « elle sera relue ») est conservée sous son propre mode après sa relecture : c'est la fin de la boucle prévue par 0092.
6. **Paires du programme seulement** : uniquement des paires de `pairesDuProgramme(programme)` (aucune seconde liste), contrôlées une seconde fois par l'écriture contre `pairesDistinctes(pairesDuProgramme(programme))` du programme lu ; une clé étrangère au programme est ignorée.
7. **Aucun écrasement** d'un temps déjà conservé (de l'exécution ou d'un affichage concurrent) : `INSERT … ON CONFLICT DO NOTHING` sur la contrainte unique existante `(programme_id, mode, origine, destination)` ; `vadrouille_prototype` n'a ni `UPDATE` ni `DELETE` (0092 § 3, inchangé). Une paire conservée n'est d'ailleurs jamais relue (0092 § 4 point 2).
8. **Aucune durée inventée** : seules les minutes d'une relecture **réussie** sont écrites. Refus (`quota_reached`, `unavailable`), relecteur qui lève, réponse hors contrat (longueur, valeur) ou itinéraire absent (`route_absente`, la relecture échoue) : **rien n'est écrit**, la page s'affiche sans ces temps (0092 § 4 point 3, inchangé).

### 2. Écrivain, rôle et droits

- **Un seul module** écrit après relecture : `src/adapters/prototype-lecture.ts`, déjà admis à nommer `prototype.trajets` (test `imports: table des temps de trajet nommée par deux modules seulement`, inchangé). Le relecteur ne reçoit ni le programme ni son identifiant et n'écrit rien ; l'adaptateur (`src/adapters/prototype.ts`) ne connaît ni la base ni l'identifiant du programme : il rend les temps relus à une fonction `conserver` que la source attache au programme lu.
- **Côté serveur, même barrière que la lecture** : `conserver` rappelle la barrière (`pool()`) au moment d'écrire ; garde du mode réel fermée ou cookie absent : aucune connexion, rien n'est écrit. Les valeurs viennent du relecteur serveur, jamais du navigateur.
- **Rôle** : `vadrouille_prototype`, pool de la barrière, avec ses **droits actuels** sur `prototype.trajets` (`INSERT (programme_id, mode, origine, destination, minutes)` et `SELECT` sous politique `org_prototype`, `expires_at > now()`), qui suffisent : `ON CONFLICT DO NOTHING` sans cible ne demande aucun autre droit. **Aucune migration, aucun `GRANT`, aucune politique nouvelle** ; donc aucune PR d'approbation `db-migrate` à faire pour cette décision.
- **Transaction** : une transaction courte par requête de relecture réussie (une par journée, pour le voyage comme pour les propositions), distincte de la lecture `READ ONLY` : `BEGIN`, `SET LOCAL statement_timeout` (même délai que la lecture), **une seule** requête `INSERT … SELECT … FROM ROWS FROM (pg_catalog.unnest($2::text[]), …, pg_catalog.unnest($5::integer[])) … ON CONFLICT DO NOTHING`, valeurs en paramètres liés (le texte ne contient ni identifiant de lieu ni durée), `COMMIT`. Toute erreur : `ROLLBACK`, client détruit (`release(true)`), **rien n'est écrit et la page est servie** (une écriture refusée ne fait jamais perdre l'affichage) ; la paire sera relue au prochain affichage.
- **Idempotente** : deux affichages simultanés ou successifs du même programme n'écrivent chaque paire qu'une fois.
- **Compatibilité** (0092 § 5 point 6) : `conserver` n'est attachée que si la lecture a constaté la table (`to_regclass`) et lu un identifiant de programme de forme uuid ; table absente : rien n'est tenté, tout est relu comme avant. Les programmes de dossier (`createPrototypeAdapter`, relecteur simulé) n'ont pas de `conserver` : rien n'est écrit, le compteur de relectures simulées (e2e « prototype sans cache ») reste celui d'aujourd'hui.
- **Journal** : aucun événement nouveau ; une écriture en échec est silencieuse (aucune valeur à journaliser, et aucun nom d'erreur de la base n'est utile à l'affichage). Une écriture qui échouerait toujours se voit à la consommation (une ligne `prototype.forfaits` par journée relue, 0079) ; question 1 de la PR à la Sécurité.

### 3. Principe « l'agent cherche, l'ancrage vérifie, le moteur planifie »

Inchangé. Les temps conservés après relecture sont ceux que Routes a mesurés pour les lieux que le moteur a planifiés ; personne n'en invente, ni le modèle, ni l'adaptateur. Le moteur ne relit pas ces temps (le programme n'est pas replanifié à l'affichage).

### 4. Tests exigés (livrés dans la même PR)

- **unitaires** (`src/adapters/prototype-trajets.test.ts`, `src/adapters/prototype-lecture.test.ts`) : après une relecture réussie, `conserver` reçoit exactement les paires relues et leurs minutes ; les paires déjà conservées ne sont jamais envoyées ; un second affichage, sur une source qui garde ce qui est écrit, n'appelle plus le relecteur ; refus, exception, réponse hors contrat : rien n'est écrit ; minutes hors bornes affichées mais non écrites ; `conserver` qui échoue : page servie ; table absente, identifiant illisible ou barrière fermée à l'écriture : aucune écriture ; requête fixe (`INSERT … ON CONFLICT DO NOTHING`, sans `UPDATE` ni valeur dans le texte), transaction bornée, `ROLLBACK` et client détruit sur erreur ; clé étrangère au programme ignorée ;
- **base** (`tests/db/trajets-prototype.test.ts`, en CI) : sous `vadrouille_prototype`, un affichage d'un programme sans temps conserve les paires relues (expiration copiée du programme, `org_prototype`) et un second affichage n'appelle pas le relecteur ; un temps de l'exécution n'est jamais remplacé ; une seconde conservation des mêmes paires n'écrit rien et ne lève pas ; un refus n'écrit rien.

### 5. Conséquences

- Un programme ancien (écrit avant la migration `0011_trajets_prototype`) consomme une relecture par journée **au premier affichage réussi** ; ensuite, ses paires conservées ne rappellent plus Routes jusqu'à son expiration. Une relecture refusée ou en échec ne conserve rien : la paire est retentée au prochain affichage (et consomme alors, comme aujourd'hui).
- Les propositions d'un programme ancien sont conservées à l'affichage de la présentation, de la même façon.
- Le risque accepté par Samuel dans 0092 (« contraire au contrat Google : risque que Google coupe ta clé ») couvre ces temps : même nature, même table, même purge.

### 6. Revues

- **Sécurité : verdict demandé** sur le nouveau chemin d'écriture (rôle et droits inchangés, `ON CONFLICT DO NOTHING`, barrière rappelée à l'écriture, écriture pendant le rendu d'une page `GET`, absence de journal) et sur le confinement (aucun nouveau module ne nomme la table).
- **Tech Lead** : revue de conformité de la PR de code à cette décision.

## Quand revoir cette décision

Celles de 0092 ; et si une écriture pendant le rendu d'une page devait être interdite (passage à des actions serveur ou à un traitement différé), ou si la Sécurité demande un journal d'échec.
