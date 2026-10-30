import { DayLine } from "@/components/ligne/DayLine";
import type { TransferItem } from "@/contracts";

import { texteDuChangement } from "./changement-de-ville";

/**
 * Ligne « Vers {ville} » de la Journée (spécification M4 § 7.6). Chargée à la demande par la Journée (`lazy`), seulement
 * le jour d'un changement de ville : un voyage à une ville n'en paie pas le JavaScript initial (handover front § 14).
 */
export function VersVille({ transfer }: { transfer: TransferItem }) {
  return <DayLine.Transfer text={texteDuChangement(transfer)} />;
}
