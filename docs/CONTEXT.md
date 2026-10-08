# Contexte du studio — Vadrouille

À lire au début de chaque session. Les détails sont dans les documents liés en bas de page.

## Le produit
**Vadrouille** (nom provisoire) : planificateur de voyages IA, application web mobile d'abord. Promesse : « Ton voyage, de l'hôtel à la soirée : quoi faire, où manger et ce qui se passe pendant ton séjour. »
On découvre avant de payer : 8 propositions offertes dans la présentation, puis paiement unique (TWINT ou carte).
Cible du MVP : couples francophones (Suisse romande) préparant 5 à 10 jours en Europe. Plus tard : agences de voyages, abonnement par conseiller.

## Principes produit
1. Le meilleur de la destination, bien organisé : la distance est un coût, pas un filtre (cadrage § 3.7).
2. Fiabilité : aucun lieu inventé ou fermé ; horaires et dates sourcés et datés ; incertitudes visibles.
3. Présentation « J'aime / Pas pour moi » ouverte d'office ; aucune généralisation silencieuse des préférences.
4. Aucun trou dans le programme ; badges seulement pour les exceptions ; vocabulaire fixe.
5. Rien ne change sans aperçu des effets ; toute modification est annulable 5 secondes.

## Principes techniques
1. L'agent cherche, l'ancrage vérifie, le moteur planifie.
2. Aucune donnée Google dans un prompt ; seul l'identifiant de lieu est stocké ; données de lieux Google seulement sur la carte Google ou avec attribution.
3. Contrats partagés dans `src/contracts` ; multi-organisation dès le schéma.
4. TypeScript de bout en bout, Next.js, Tailwind v4 avec les tokens Ligne, Postgres en région UE, Vercel.

## Phase en cours
**Phase 0 — Valider.** Autorisé pour le studio : socle front F0 à F3 sur données simulées, prototype de l'agent de recherche (P0). Interdit tant que la condition G0 n'est pas franchie : tout engagement de dépense externe, toute mise en production.

## Règles du studio
- Cycle de 4 heures ; au plus 2 tâches par cycle, sur des fichiers distincts.
- Rien n'entre dans `main` sans CI verte et validation du Tech Lead.
- Régime actuel : **Veille** (2 cycles par jour) jusqu'à décision de Samuel.
- Le contexte vit dans le dépôt : `STATUS.md` est mis à jour à la fin de chaque cycle.

## Qui décide quoi
**Réservé à Samuel** : stratégie produit (cible, offre, prix, phases G0 à G3), argent, comptes externes et clés, mise en production, juridique, création de rôle, modification de ces règles.
Ces questions vont dans `#studio` et dans `QUESTIONS.md` (par le CEO) ; le studio continue sur autre chose en attendant.

**Délégué** :
- Tech Lead : architecture, bibliothèques, outillage, tests.
- UX/UI : écrans non maquettés, dans les règles de Ligne.
- Product Owner : détails fonctionnels, dans le cadre du cadrage.
- CEO : ordre des tâches.

Une décision déléguée est écrite dans `docs/decisions/` ou dans la spécification, listée dans la note de version suivante (rubrique « Décisions prises par le studio ») et devient définitive sans veto de Samuel sous 2 jours.
Tout ce qui engage de l'argent, un compte externe ou des données personnelles hors UE remonte à Samuel, même dans un domaine délégué.

## Où trouver quoi
| Besoin | Document |
|---|---|
| Produit complet | `docs/produit/cadrage-v5.md` |
| Interface, composants, critères | `docs/handovers/frontend.md` |
| Design system Ligne | `docs/design-system/` |
| UX : personas, parcours, interactions, plan de test | `docs/ux/dossier-ux.md` |
| Maquettes | `docs/ux/maquettes/` |
| Ordre des travaux | `docs/roadmap.md` |
| Décisions d'architecture | `docs/decisions/` |
| Fonctionnement du studio | `docs/studio/` |
