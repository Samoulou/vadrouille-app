#!/usr/bin/env bash
# Prépare la base de test de la CI (spécification B1) : amorçage des rôles avec l'utilisateur administrateur du
# conteneur, mots de passe jetables pour les cinq rôles de connexion, migrations sous vadrouille_migrator.
# Usage : scripts/ci/db-setup.sh [--twice]   (--twice : amorçage et migrations rejoués, la seconde fois sans effet)
# Entrée : VADROUILLE_DB_ADMIN_URL, ou à défaut PGHOST, PGPORT, PGUSER, PGDATABASE (superutilisateur du conteneur
# postgres:17.11, jetable, authentification « trust » limitée au conteneur) ; EXPECTED_SERVER_VERSION facultative.
# Sortie : VADROUILLE_DATABASE_URL, VADROUILLE_DATABASE_URL_AUTH, VADROUILLE_DATABASE_URL_MIGRATOR, et pour les tests
# de base du prototype (décision 0046) VADROUILLE_DB_PROTOTYPE_URL et VADROUILLE_DB_PROTOTYPE_PURGE_URL, dans
# $GITHUB_ENV, masquées dans les journaux (jamais l'adresse d'administration). Aucune valeur n'est écrite dans le
# dépôt. Les deux variables du prototype sont propres aux tests : la base de service de la CI n'est jamais désignée
# par une variable P0_*, réservée à la préversion de p0-reel (0046, S5).
# Le refus de SKIP_DB_TESTS en CI est fait par scripts/test-db.mjs seulement.
set -euo pipefail

if [ -z "${VADROUILLE_DB_ADMIN_URL:-}" ]; then
  # En CI : variables libpq standard (PGHOST, PGPORT, PGUSER, PGDATABASE) du conteneur de service.
  : "${PGHOST:?PGHOST absente}" "${PGPORT:?PGPORT absente}" "${PGUSER:?PGUSER absente}" "${PGDATABASE:?PGDATABASE absente}"
  VADROUILLE_DB_ADMIN_URL="postgresql://${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}"
  export VADROUILLE_DB_ADMIN_URL
  # Jamais dans $GITHUB_ENV : l'accès administrateur reste limité aux étapes qui le posent (.github/workflows/ci.yml).
fi
if [ -n "${EXPECTED_SERVER_VERSION:-}" ]; then
  version="$(psql "$VADROUILLE_DB_ADMIN_URL" -tAc 'SHOW server_version')"
  case "$version" in
    "$EXPECTED_SERVER_VERSION"*) echo "Postgres ${version}" ;;
    *) echo "Postgres ${version} au lieu de ${EXPECTED_SERVER_VERSION} (décision 0006)." >&2; exit 1 ;;
  esac
fi

case "$VADROUILLE_DB_ADMIN_URL" in
  *@*) ;;
  *) echo "VADROUILLE_DB_ADMIN_URL doit avoir la forme postgres://utilisateur@hôte:port/base (adresse non affichée)." >&2; exit 1 ;;
esac
host_part="${VADROUILLE_DB_ADMIN_URL##*@}" # hôte:port/base (après le dernier @ : un @ encodé du mot de passe n'y est pas)
runs=1
if [ "${1:-}" = "--twice" ]; then runs=2; fi

for _ in $(seq 1 "$runs"); do
  psql "$VADROUILLE_DB_ADMIN_URL" -v ON_ERROR_STOP=1 -q -f db/bootstrap/roles.sql
done

for role in migrator app auth prototype prototype_purge; do
  password="$(openssl rand -hex 24)"
  echo "::add-mask::${password}"
  # Mot de passe transmis à psql par l'entrée standard (\set dans un document « here »), jamais dans sa ligne de
  # commande, visible dans la liste des processus. Valeur hexadécimale : aucun caractère à échapper.
  psql "$VADROUILLE_DB_ADMIN_URL" -v ON_ERROR_STOP=1 -q -v role="vadrouille_${role}" <<SQL
\set pw '${password}'
ALTER ROLE :"role" PASSWORD :'pw';
SQL
  url="postgres://vadrouille_${role}:${password}@${host_part}"
  echo "::add-mask::${url}"
  case "$role" in
    migrator) export VADROUILLE_DATABASE_URL_MIGRATOR="$url"; name=VADROUILLE_DATABASE_URL_MIGRATOR ;;
    app) export VADROUILLE_DATABASE_URL="$url"; name=VADROUILLE_DATABASE_URL ;;
    auth) export VADROUILLE_DATABASE_URL_AUTH="$url"; name=VADROUILLE_DATABASE_URL_AUTH ;;
    prototype) export VADROUILLE_DB_PROTOTYPE_URL="$url"; name=VADROUILLE_DB_PROTOTYPE_URL ;;
    prototype_purge) export VADROUILLE_DB_PROTOTYPE_PURGE_URL="$url"; name=VADROUILLE_DB_PROTOTYPE_PURGE_URL ;;
  esac
  if [ -n "${GITHUB_ENV:-}" ]; then echo "${name}=${url}" >> "$GITHUB_ENV"; fi
done

for i in $(seq 1 "$runs"); do
  output="$(pnpm -s db:migrate)"
  echo "$output"
  if [ "$i" -eq 2 ] && ! grep -q "Migrations appliquées : 0 " <<<"$output"; then
    echo "La seconde exécution des migrations aurait dû ne rien faire." >&2
    exit 1
  fi
done
