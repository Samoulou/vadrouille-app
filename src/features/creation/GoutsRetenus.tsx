"use client";

import { useState } from "react";

import { Chip } from "@/components/ligne/Chip";
import type { Category, RetainedPreference } from "@/contracts";
import { tasteLabel } from "@/features/voyage/tastes";
import * as messages from "@/i18n/messages";

import type { BriefValues } from "./draft";
import { etatDuGout, goutsProposables, type GoutPropose } from "./gouts";

const t = messages.creation.ecran2.verification.gouts;

export interface GoutsRetenusProps {
  /** Goûts de la personne de la session, lus par la page à chaque affichage (décision 0160 § 1.6). */
  tastes: readonly RetainedPreference[];
  values: Pick<BriefValues, "wishes" | "limits">;
  /** Bascule la catégorie dans le champ du brief, comme une `Chip` de ce champ : une saisie de la personne. */
  onToggle: (field: GoutPropose["field"], category: Category) => void;
}

/**
 * Bloc « Tes goûts retenus » de l'écran 2 (M8c-2, ticket 1131 ; spécification M8 § 5.4 et § 7). **Proposés, jamais
 * appliqués d'office** : un choix par goût, décoché au départ. Cocher « Tu aimes… » ajoute la catégorie aux envies,
 * « Tu préfères éviter… » à « À limiter » ; décocher la retire. Un goût déjà vrai dans le brief est coché et indisponible
 * (« Déjà dans ce voyage ») ; un goût contraire au brief est décoché et indisponible (« Contraire à ce voyage ») : le brief
 * du voyage l'emporte. Sans goût à proposer, le bloc n'existe pas.
 *
 * Les cases cochées ici vivent dans l'état du composant : après un retour au récit ou à l'écran 1, une catégorie cochée
 * par un goût est une saisie du brief comme une autre (« Déjà dans ce voyage »), et se retire dans son champ.
 * Rendu provisoire (UX/UI, U4) : composants Ligne existants seulement (`Chip`), comme « Retenir mes goûts ».
 */
export function GoutsRetenus({ tastes, values, onToggle }: GoutsRetenusProps) {
  const [coches, setCoches] = useState<ReadonlySet<string>>(new Set());
  const gouts = goutsProposables(tastes);
  if (gouts.length === 0) return null;

  const basculer = (gout: GoutPropose, selected: boolean) => {
    setCoches((current) => {
      const next = new Set(current);
      if (selected) next.add(gout.id);
      else next.delete(gout.id);
      return next;
    });
    onToggle(gout.field, gout.category);
  };

  return (
    <section aria-labelledby="gouts-titre" data-part="gouts-retenus" className="flex flex-col gap-3">
      <h2 id="gouts-titre" className="text-section font-extrabold text-ink">
        {t.titre}
      </h2>
      <p className="text-corps-s text-ink-soft">{t.aide}</p>
      <ul className="flex flex-col gap-3">
        {gouts.map((gout, index) => {
          const etat = etatDuGout(gout, values, coches);
          const indisponible = etat === "dejaDansCeVoyage" || etat === "contraire";
          const etatId = `gout-etat-${index}`;
          return (
            <li key={gout.id} data-taste={gout.id} className="flex flex-col items-start gap-1">
              <Chip
                label={tasteLabel({ kind: "category", category: gout.category, direction: gout.field === "wishes" ? "more" : "less" })}
                selected={etat === "coche" || etat === "dejaDansCeVoyage"}
                aria-disabled={indisponible || undefined}
                aria-describedby={indisponible ? etatId : undefined}
                onSelectedChange={(selected) => basculer(gout, selected)}
                // Mise en page seulement : un libellé long passe à la ligne au lieu de déborder à 390 px.
                className="max-w-full justify-start py-2 text-left"
              />
              {indisponible ? (
                <p id={etatId} className="text-legende text-ink-soft">
                  {t[etat]}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
