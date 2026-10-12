import { BlockList, isIP } from "node:net";

/**
 * Contrôle des adresses de la lecture des pages (spécification P0, « garde contre les requêtes détournées » ;
 * décision 0032, A7.1). Seul fichier autorisé à importer `node:net`, sous cette seule forme ; importé seulement
 * par `fetch-page.ts` (et son test). Reçoit des chaînes, n'ouvre aucune connexion, n'importe rien d'autre.
 *
 * Le test d'appartenance passe par `net.BlockList` de Node, jamais par des comparaisons de chaînes écrites à la
 * main ; aucune bibliothèque de CIDR.
 */

/** Plages IPv4 interdites (adresse, longueur de préfixe). */
export const PLAGES_INTERDITES_IPV4: readonly (readonly [string, number])[] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  // AS112 (RFC 7534 et 7535) : anycast public, risque faible, refusé par prudence (revue Sécurité de #180).
  ["192.31.196.0", 24],
  ["192.52.193.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["192.175.48.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

/** Plages IPv6 interdites, appliquées en filet à l'intérieur de la liste d'autorisation `2000::/3`. */
export const PLAGES_INTERDITES_IPV6: readonly (readonly [string, number])[] = [
  ["::", 128],
  ["::1", 128],
  ["::", 96],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  // Bloc IETF pour usages spéciaux (RFC 2928) : couvre aussi 2001:1::, 2001:2::, 2001:3::, 2001:4:112::.
  ["2001::", 23],
  ["2001::", 32],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["2620:4f:8000::", 48],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
];

/** Liste d'autorisation IPv6 : unicast global seulement. */
export const AUTORISATION_IPV6: readonly [string, number] = ["2000::", 3];

// Deux listes distinctes : une `BlockList` compare aussi une adresse IPv4 aux règles IPv6 (forme `::ffff:a.b.c.d`
// et `::a.b.c.d`), ce qui ferait tomber toute IPv4 dans `::/96`.
const interditesV4 = new BlockList();
for (const [adresse, prefixe] of PLAGES_INTERDITES_IPV4) interditesV4.addSubnet(adresse, prefixe, "ipv4");
const interditesV6 = new BlockList();
for (const [adresse, prefixe] of PLAGES_INTERDITES_IPV6) interditesV6.addSubnet(adresse, prefixe, "ipv6");

const autoriseesV6 = new BlockList();
autoriseesV6.addSubnet(AUTORISATION_IPV6[0], AUTORISATION_IPV6[1], "ipv6");

/**
 * Vrai si l'adresse résolue peut être contactée : IPv4 hors des plages interdites ; IPv6 dans `2000::/3` **et**
 * hors des plages interdites. Toute autre chaîne est refusée.
 */
export function adresseAutorisee(adresse: string): boolean {
  const famille = isIP(adresse);
  if (famille === 4) return !interditesV4.check(adresse, "ipv4");
  if (famille === 6) return autoriseesV6.check(adresse, "ipv6") && !interditesV6.check(adresse, "ipv6");
  return false;
}

/** Vrai si le nom d'hôte (déjà normalisé) est une adresse IP littérale. */
export function estIpLitterale(hote: string): boolean {
  return isIP(hote) !== 0;
}
