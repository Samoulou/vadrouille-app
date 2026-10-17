-- Repli manuel de la purge du MVP (décision 0060 § 3.5, point 1) : à coller et exécuter par Samuel, et par lui seul,
-- dans l'éditeur SQL de la console Neon (projet et branche de la base, base de l'application), sous l'utilisateur
-- propriétaire de l'intégration, quand `coords-purge.yml` ne peut pas réussir. Le studio ne l'exécute jamais.
--
-- Une seule instruction : elle réussit en entier ou ne change rien. Le bloc se donne une appartenance temporaire à
-- vadrouille_coords_purge (SET sans INHERIT), grâce à la ligne ADMIN seule que le propriétaire tient de l'amorçage,
-- appelle la purge sous ce rôle (lignes expirées seulement, de toutes les organisations), puis retire l'appartenance
-- et vérifie qu'il ne reste que la ligne ADMIN seule ; sinon, l'exception annule tout, purge comprise.
-- Noter l'heure UTC juste avant de lancer le bloc (R) et à la réponse DO (F), et les donner au CEO (0060 § 3.5).
-- Contrôle après l'exercice : requête filtrée sur le rôle de `db/README.md` (0060 § 3.3), une seule ligne attendue.
DO $$
DECLARE
  v_moi CONSTANT text := pg_catalog.current_user();
BEGIN
  EXECUTE pg_catalog.format('GRANT vadrouille_coords_purge TO %I WITH INHERIT FALSE, SET TRUE', v_moi);
  SET LOCAL ROLE vadrouille_coords_purge;
  PERFORM public.purge_expired_coordinates();
  EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_moi);
  EXECUTE pg_catalog.format('REVOKE vadrouille_coords_purge FROM %I', v_moi);
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members am
    JOIN pg_catalog.pg_roles r ON r.oid = am.roleid
    JOIN pg_catalog.pg_roles m ON m.oid = am.member
    WHERE r.rolname = 'vadrouille_coords_purge' AND m.rolname = v_moi
      AND (am.inherit_option OR am.set_option OR NOT am.admin_option)
  ) THEN
    RAISE EXCEPTION 'repli : appartenance temporaire non retirée';
  END IF;
END
$$;
