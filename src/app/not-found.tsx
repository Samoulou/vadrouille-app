import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ligne";
import { PRODUCT_NAME } from "@/config/site";
import { EtatPage } from "@/features/etats/EtatPage";
import { format, messages } from "@/i18n";

const t = messages.etats;
const documentTitle = format(t.introuvable.titreDocument, { produit: PRODUCT_NAME });

/**
 * Titre du document, par deux voies (décision 0021 § 7, mesuré par le test `etats: page introuvable`) :
 * - l'export `metadata` sert les adresses qu'aucune route ne reconnaît : sans lui, le titre du layout racine
 *   passe avant l'élément <title> ;
 * - l'élément <title> de React 19 sert les `notFound()` des écrans : Next 16.4 y garde la `metadata` de
 *   l'écran (nom du produit, « Tes premières propositions »), et l'élément <title> passe devant.
 */
export const metadata: Metadata = { title: documentTitle };

/**
 * Page introuvable (écran 18, F11-PO-17, décision 0021 § 7) : toute réponse 404 de l'application, adresses
 * inconnues et `notFound()` des écrans. Sans lecture de données ni de paramètre : elle ne dit ni l'adresse
 * demandée ni la raison, et son contenu est le même pour toutes les 404.
 */
export default function NotFound() {
  return (
    <>
      <title>{documentTitle}</title>
      <EtatPage title={t.introuvable.titre} text={t.introuvable.texte}>
        <Button asChild>
          <Link href="/" prefetch={false}>
            {t.accueil}
          </Link>
        </Button>
      </EtatPage>
    </>
  );
}
