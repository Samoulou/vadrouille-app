#!/bin/sh
# Étape « Ignored Build Step » de Vercel (`ignoreCommand` de vercel.json ; décision 0163, ticket #1050).
# Offre gratuite de Vercel : 100 déploiements par jour au plus. La CI tourne dans GitHub Actions ; seules les
# branches `main` (adresse de démonstration) et `p0-reel` (essais réels, décision 0055) sont construites par Vercel.
# Convention de Vercel : sortie 0 = construction ignorée, sortie 1 = construction lancée.
# Entrée : VERCEL_GIT_COMMIT_REF (branche du commit, posée par Vercel). Absente ou vide (déploiement sans Git) :
# construction ignorée, échec fermé du côté du quota. Comparaison exacte, sans changement de casse ni d'espaces.
# Élargir la liste demande une décision (0163, § « Quand revoir »).
ref="${VERCEL_GIT_COMMIT_REF:-}"

case "$ref" in
  main | p0-reel)
    echo "vercel ignore-build : branche « $ref » construite."
    exit 1
    ;;
  *)
    echo "vercel ignore-build : construction ignorée (branche « ${ref:-absente} » hors de main et p0-reel, décision 0163)."
    exit 0
    ;;
esac
