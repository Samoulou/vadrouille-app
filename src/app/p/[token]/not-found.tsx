import type { Metadata } from "next";

import { PRODUCT_NAME } from "@/config/site";
import { EtatPage } from "@/features/etats/EtatPage";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

const t = messages.partage.invalide;
const documentTitle = format(messages.partage.vue.titreDocument.invalide, { produit: PRODUCT_NAME });

/**
 * Titre du document par deux voies, comme `src/app/not-found.tsx` (décision 0021 § 7) : l'export `metadata` vaut
 * pour les adresses de ce segment qu'aucune page ne reconnaît ; l'élément <title> de React 19 vaut pour les
 * `notFound()` de `RP` et `RPJ`, où Next 16.4 garde la `metadata` de la page (sans titre) et ferait sinon passer le
 * titre du layout racine. Les deux portent le même texte.
 */
export const metadata: Metadata = { title: documentTitle, robots: { index: false, follow: false } };

/**
 * 404 de la vue partagée (spécification F10, F10-PO-15 ; décision 0039, F10-TL-3) : même page pour un jeton
 * inconnu, désactivé, expiré ou mal formé, et pour un jour hors du voyage, sans dire lequel. Aucune action :
 * le visiteur n'a pas de page de l'application à rejoindre (provisoire, UX/UI).
 */
export default function SharedNotFound() {
  return (
    <>
      <title>{documentTitle}</title>
      <EtatPage title={t.titre} text={t.texte}>
        {null}
      </EtatPage>
    </>
  );
}
