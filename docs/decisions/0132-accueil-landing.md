# 0132 — Page d'accueil qui donne envie (landing)

Statut : **acceptée** · Date : 2026-10-28 · Décideur : UX/UI (écran non maquetté, dans les règles de Ligne ; `docs/CONTEXT.md`, « Qui décide quoi ») · Ticket : #802 · Définitive à sa fusion (0093). À lister dans la prochaine note de version (« Décisions prises par le studio »).

## Contexte
Demande de Samuel du 2026-10-28 (fil « Rendre l'app séduisante pour les nouveaux clients ») : audit UX « sexy et séduisant pour les nouveaux clients », « penser aussi à la landing page ». L'accueil n'avait que le nom, la promesse et « Créer un voyage » : rien ne montrait ce qu'on reçoit, ni comment ça marche.

## Décision
1. L'accueil (`src/app/page.tsx`) rend `Landing` (`src/features/accueil/Landing.tsx`), composant serveur sans JavaScript client, dans cet ordre :
   - en-tête : nom (`h1`, style `destination`), accroche (`titre-jour` 800, un niveau sous le nom), promesse (`produit.promesse`, inchangée), « Créer un voyage » (`Button` principal), « Tes premières propositions sont offertes. » (principe du cadrage : 8 propositions offertes avant de payer), puis « Mes voyages » sur le site d'essai ;
   - « Une journée de ton programme » : une seule plaque de destination (`azulejo`, « Ta destination », « Exemple ») et la vraie `DayLine` sur une journée écrite à la main : destination et secteurs génériques, aucun lieu réel nommé ni événement daté (règle d'or 2 du handover frontend), aucune donnée Google ; aucune étape n'est un lien ni ne porte d'exception ; légende « Exemple de journée, pour illustrer. » ;
   - « Comment ça marche » : trois étapes numérotées dans un anneau `ink` (raconter, trier, recevoir) ;
   - « Ce que tu reçois » : les lignes de l'offre affichée sur « Débloquer » qui ne dépendent pas des dates du voyage, lues dans les mêmes clés (`debloquer.offre.inclus.*`, une seule source de vérité) (coche `ink`) ;
   - « Aucun lieu inventé » (principe produit 2) ;
   - bloc `muted` « Prêt à partir ? » avec « Créer un voyage », rappelé (même adresse, même nom : une action garde le même nom partout, handover règle d'or 9, WCAG 3.2.4) ;
   - section « Démonstration » (adaptateur `mock` seulement, spécification D1) en fin de page, après le dernier bouton.
2. Aucun prix sur l'accueil, exemple de journée compris (aucun coût par personne sur ses étapes) : l'offre et le prix restent à Samuel ; seul le principe « premières propositions offertes » du cadrage est rappelé.
3. Ligne respectée : le bleu seulement pour la ligne de l'exemple et les boutons ; aucun jaune (aucune action requise sur cet écran) ; interlettrage par les jetons de Ligne ; ni ombre, ni emoji, ni capitales.

## Conséquences
- Capture de référence `accueil.png` (visuel D1) à régénérer.
- `tests/unit/accueil.test.tsx` : l'accueil sans démonstration a désormais deux liens, tous deux vers l'écran 1.
- Une vraie photo de destination en en-tête attend les règles des photos (README de Ligne, « Reste à faire ») : hors de cette décision.
