-- Migration inverse de 0025_recu_stripe (B4e, ticket 887 ; décision 0144 § 5.3 point 1, « migration descendante
-- étendue »). Elle **défait la migration entière**, dans l'ordre inverse : déclencheur, fonction, puis colonne (la
-- contrainte `checkouts_stripe_receipt_url_check` et le droit `UPDATE (stripe_receipt_url)` de `vadrouille_webhook`
-- tombent avec la colonne).
--
-- **Exception nommée** à la règle « aucune migration inverse ne supprime une colonne porteuse de données »
-- (`db/README.md`, § 2), sur le modèle de 0004 et 0009, prescrite par la décision 0144 (Tech Lead, avec la Sécurité) :
-- la colonne ne porte qu'un lien vers le reçu tenu par Stripe en mode test, sans valeur comptable (Q127), relisible
-- chez Stripe depuis la session de paiement (0144 § 5.3 point 2) ; les lignes `checkouts` restent : ni `DELETE`, ni
-- `TRUNCATE`, ni changement d'une autre colonne. Tant que la tâche `back` de B4e n'est pas livrée, la colonne est vide
-- partout. L'exception ne vaut que pour cette colonne ; sa confirmation est demandée au Tech Lead dans la PR.
--
-- Après cette descente, le texte de 0025 se rejoue sans erreur (aucun objet qu'il crée ne subsiste ; test de
-- `tests/db/recu-stripe.test.ts`, base jetable) ; mais le journal de `vadrouille_migrations` garde 0025 appliquée : un
-- retour passe par une migration corrective vers l'avant qui reprend ce texte. Descente à jouer hors de tout code de la
-- tâche `back` de B4e déployé sur la base (il écrit et lit la colonne).
SET LOCAL ROLE vadrouille_owner;
--> statement-breakpoint
DROP TRIGGER checkouts_receipt_once ON public.checkouts;
--> statement-breakpoint
DROP FUNCTION public.checkouts_receipt_once();
--> statement-breakpoint
ALTER TABLE public.checkouts DROP COLUMN stripe_receipt_url;
--> statement-breakpoint
RESET ROLE;
