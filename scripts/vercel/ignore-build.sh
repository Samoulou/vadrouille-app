#!/bin/sh
# Étape « Ignored Build Step » de Vercel (`ignoreCommand` de vercel.json ; décision 0163, ticket #1050).
# Offre gratuite de Vercel : 100 déploiements par jour au plus. La CI tourne dans GitHub Actions ; seules les
# branches `main` (adresse de démonstration), `p0-reel` (essais réels, décision 0055) et `mvp-essai` (préversion de la
# vraie app, décision 0169 qui amende 0163) sont construites par Vercel.
# Convention de Vercel : sortie 0 = construction ignorée, sortie 1 = construction lancée.
# Entrée : VERCEL_GIT_COMMIT_REF (branche du commit, posée par Vercel). Absente ou vide (déploiement sans Git) :
# construction ignorée, échec fermé du côté du quota. Comparaison exacte, sans changement de casse ni d'espaces.
# Élargir la liste demande une décision (0163, § « Quand revoir » ; dernier amendement : 0169 § 8).
ref="${VERCEL_GIT_COMMIT_REF:-}"

case "$ref" in
  main | p0-reel | mvp-essai)
    echo "vercel ignore-build : branche « $ref » construite."
    exit 1
    ;;
  *)
    # Le nom de branche n'est pas recopié dans le journal : il vient du dépôt et peut contenir n'importe quel texte.
    echo "vercel ignore-build : construction ignorée (branche hors de main, p0-reel et mvp-essai, ou absente ; décision 0163)."
    exit 0
    ;;
esac
