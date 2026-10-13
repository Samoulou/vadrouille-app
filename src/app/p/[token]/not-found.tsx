import type { Metadata } from "next";

import { PRODUCT_NAME } from "@/config/site";
import { EtatPage } from "@/features/etats/EtatPage";
import { format, messages } from "@/i18n";

const t = messages.partage.invalide;
const documentTitle = format(messages.partage.vue.titreDocument.invalide, { produit: PRODUCT_NAME });

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
