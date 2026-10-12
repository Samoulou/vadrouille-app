#!/usr/bin/env bash
# Prépare la base de test de la CI (spécification B1) : amorçage des rôles avec l'utilisateur administrateur du
# conteneur, mots de passe jetables pour les trois rôles de connexion, migrations sous vadrouille_migrator.
# Usage : scripts/ci/db-setup.sh [--twice]   (--twice : amorçage et migrations rejoués, la seconde fois sans effet)
# Entrée : VADROUILLE_DB_ADMIN_URL, ou à défaut PGHOST, PGPORT, PGUSER, PGDATABASE (superutilisateur du conteneur
# postgres:17.11, jetable, authentification « trust » limitée au conteneur) ; EXPECTED_SERVER_VERSION facultative.
# Sortie : VADROUILLE_DATABASE_URL, VADROUILLE_DATABASE_URL_AUTH, VADROUILLE_DATABASE_URL_MIGRATOR dans $GITHUB_ENV,
# masquées dans les journaux. Aucune valeur n'est écrite dans le dépôt.
set -euo pipefail

if [ -z "${VADROUILLE_DB_ADMIN_URL:-}" ]; then
  # En CI : variables libpq standard (PGHOST, PGPORT, PGUSER, PGDATABASE) du conteneur de service.
  : "${PGHOST:?PGHOST absente}" "${PGPORT:?PGPORT absente}" "${PGUSER:?PGUSER absente}" "${PGDATABASE:?PGDATABASE absente}"
  VADROUILLE_DB_ADMIN_URL="postgresql://${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}"
  export VADROUILLE_DB_ADMIN_URL
  if [ -n "${GITHUB_ENV:-}" ]; then echo "VADROUILLE_DB_ADMIN_URL=${VADROUILLE_DB_ADMIN_URL}" >> "$GITHUB_ENV"; fi
fi
if [ -n "${EXPECTED_SERVER_VERSION:-}" ]; then
  version="$(psql "$VADROUILLE_DB_ADMIN_URL" -tAc 'SHOW server_version')"
  case "$version" in
    "$EXPECTED_SERVER_VERSION"*) echo "Postgres ${version}" ;;
    *) echo "Postgres ${version} au lieu de ${EXPECTED_SERVER_VERSION} (décision 0006)." >&2; exit 1 ;;
  esac
fi
if [ -n "${SKIP_DB_TESTS:-}" ]; then
  echo "SKIP_DB_TESTS est interdite en CI : les tests de base y font foi (décision B1-PO-1)." >&2
  exit 1
fi

host_part="${VADROUILLE_DB_ADMIN_URL#*@}" # hôte:port/base
runs=1
if [ "${1:-}" = "--twice" ]; then runs=2; fi

for _ in $(seq 1 "$runs"); do
  psql "$VADROUILLE_DB_ADMIN_URL" -v ON_ERROR_STOP=1 -q -f db/bootstrap/roles.sql
done

for role in migrator app auth; do
  password="$(openssl rand -hex 24)"
  echo "::add-mask::${password}"
  # Mot de passe passé par variable psql, jamais dans la ligne de commande ni dans un fichier.
  psql "$VADROUILLE_DB_ADMIN_URL" -v ON_ERROR_STOP=1 -q -v role="vadrouille_${role}" -v pw="$password" <<'SQL'
ALTER ROLE :"role" PASSWORD :'pw';
SQL
  url="postgres://vadrouille_${role}:${password}@${host_part}"
  echo "::add-mask::${url}"
  case "$role" in
    migrator) export VADROUILLE_DATABASE_URL_MIGRATOR="$url"; name=VADROUILLE_DATABASE_URL_MIGRATOR ;;
    app) export VADROUILLE_DATABASE_URL="$url"; name=VADROUILLE_DATABASE_URL ;;
    auth) export VADROUILLE_DATABASE_URL_AUTH="$url"; name=VADROUILLE_DATABASE_URL_AUTH ;;
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
