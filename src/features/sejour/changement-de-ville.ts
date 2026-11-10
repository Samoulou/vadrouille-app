import type { DayLineTransferText } from "@/components/ligne/DayLine";
import type { TransferItem } from "@/contracts";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { formatDuree } from "@/lib/duree";

const t = messages.sejour.journee.changement;

/**
 * Détail de la ligne « Vers {ville} » (spécification M4 § 3.3 et § 8 ; décision 0148 § 1 et § 2) :
 * - départ saisi : « {libellé}, {départ} – {arrivée} », ou « {libellé}, départ à {heure}, arrivée à confirmer » ;
 * - départ estimé : « {mode}, départ vers {heure} (estimation), environ {durée} (estimation) », ou « …, durée à
 *   confirmer » sans durée estimée ; sans mode (marche seule), la phrase commence par « Départ vers ». L'heure d'un
 *   départ estimé n'est jamais affichée sans « vers » ni « (estimation) ».
 */
export function detailDuChangement(transfer: TransferItem): string {
  if (transfer.source === "entered") {
    const libelle = transfer.label ?? "";
    return transfer.end === undefined
      ? format(t.saisiSansArrivee, { libelle, heure: transfer.start })
      : format(t.saisi, { libelle, depart: transfer.start, arrivee: transfer.end });
  }
  // Parties jointes par le modèle `nom` (« {titre}, {detail} ») : mode facultatif, départ, durée.
  const joindre = (titre: string, detail: string) => format(t.nom, { titre, detail });
  const duree = transfer.estimatedMinutes === undefined ? t.sansDuree : format(t.duree, { duree: formatDuree(transfer.estimatedMinutes) });
  const depart = joindre(format(t.depart, { heure: transfer.start }), duree);
  return transfer.mode === undefined ? depart.charAt(0).toUpperCase() + depart.slice(1) : joindre(t.modes[transfer.mode], depart);
}

/** Textes de la ligne « Vers {ville} » de la Journée (spécification M4 § 7.6) : titre, détail, nom accessible, heure. */
export function texteDuChangement(transfer: TransferItem): DayLineTransferText {
  const title = format(t.vers, { ville: transfer.to });
  const detail = detailDuChangement(transfer);
  return {
    title,
    detail,
    name: format(t.nom, { titre: title, detail }),
    // L'heure seule n'est montrée que pour un départ saisi (heure du billet ou du vol) ; un départ estimé la dit dans
    // son détail, toujours avec « vers » et « (estimation) » (spécification M4 § 3.3).
    ...(transfer.source === "entered" ? { time: transfer.start } : {}),
  };
}
