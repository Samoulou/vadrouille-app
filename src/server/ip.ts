import "server-only";

import { isIP } from "node:net";

/**
 * Adresse IP de confiance (spécification B3, B3a point 5 ; décision 0051, points 2.1 et 2.4). Ne lit que l'en-tête
 * nommé par `TRUSTED_IP_HEADER` (validé par `src/server/env/index.ts` : `x-vercel-forwarded-for` seul, derrière
 * Vercel ou en CI) ; ignore `X-Forwarded-For`, `X-Real-IP`, `Forwarded`, `CF-Connecting-IP` et tout autre en-tête.
 * Prend la première adresse de la valeur (ce qui ne vaut que parce que la plateforme pose et réécrit cet en-tête),
 * l'analyse par `node:net` (jamais par découpage de texte d'une adresse) et rend une **clé d'adresse** :
 * - IPv4 entière, en notation pointée ;
 * - IPv6 réduite à son préfixe /64, forme canonique compressée en minuscules, suivie de `/64` ;
 * - IPv4 intégrée à une IPv6 (`::ffff:a.b.c.d`, `::ffff:c000:207`) ramenée à l'IPv4.
 * Valeur absente, vide, non analysable, avec port, crochets ou identifiant de zone : `null` (compartiment commun).
 */

export type HeadersLike = { get(name: string): string | null };

/** Huit groupes de 16 bits d'une IPv6 déjà validée par `isIP` (forme mixte avec IPv4 finale comprise). */
function groupesIpv6(adresse: string): number[] {
  let texte = adresse.toLowerCase();
  // Forme mixte : l'IPv4 finale (validée par `isIP`) devient ses deux groupes de 16 bits.
  const dernier = texte.lastIndexOf(":");
  const queue = texte.slice(dernier + 1);
  if (isIP(queue) === 4) {
    const [a = 0, b = 0, c = 0, d = 0] = queue.split(".").map(Number);
    texte = `${texte.slice(0, dernier + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const lire = (partie: string) => (partie === "" ? [] : partie.split(":").map((g) => parseInt(g, 16)));
  const compresse = texte.indexOf("::");
  if (compresse < 0) return lire(texte);
  const gauche = lire(texte.slice(0, compresse));
  const droite = lire(texte.slice(compresse + 2));
  return [...gauche, ...new Array<number>(Math.max(0, 8 - gauche.length - droite.length)).fill(0), ...droite];
}

/** Forme canonique compressée (RFC 5952) de huit groupes : plus longue suite de zéros (au moins deux) en `::`. */
function compresser(groupes: readonly number[]): string {
  let debut = -1;
  let longueur = 0;
  for (let i = 0; i < groupes.length; ) {
    if (groupes[i] !== 0) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < groupes.length && groupes[j] === 0) j += 1;
    if (j - i > longueur && j - i >= 2) {
      debut = i;
      longueur = j - i;
    }
    i = j;
  }
  const hex = groupes.map((g) => g.toString(16));
  if (debut < 0) return hex.join(":");
  return `${hex.slice(0, debut).join(":")}::${hex.slice(debut + longueur).join(":")}`;
}

/** Clé d'adresse d'une adresse seule, ou `null` si elle n'est pas une IPv4 ou une IPv6 sans port, crochets ni zone. */
export function ipAddressKey(adresse: string): string | null {
  const version = isIP(adresse);
  if (version === 4) return adresse;
  if (version !== 6 || adresse.includes("%")) return null;
  const groupes = groupesIpv6(adresse);
  if (groupes.length !== 8 || groupes.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)) return null;
  // IPv4 intégrée (`::ffff:0:0/96`) : ramenée à l'IPv4. La forme « compatible IPv4 » (`::a.b.c.d`), obsolète, reste
  // une IPv6 ordinaire.
  if (groupes.slice(0, 5).every((g) => g === 0) && groupes[5] === 0xffff) {
    const [h = 0, b = 0] = groupes.slice(6);
    return `${h >> 8}.${h & 0xff}.${b >> 8}.${b & 0xff}`;
  }
  return `${compresser([...groupes.slice(0, 4), 0, 0, 0, 0])}/64`;
}

/**
 * Clé d'adresse lue dans l'en-tête de confiance, ou `null` (compartiment commun) : en-tête non configuré ou absent,
 * valeur vide ou non analysable. Seule la première adresse de la liste est lue.
 */
export function trustedIpKey(headers: HeadersLike, trustedHeader: string | null): string | null {
  if (trustedHeader === null) return null;
  const valeur = headers.get(trustedHeader);
  if (valeur === null) return null;
  const premiere = valeur.split(",")[0]?.trim() ?? "";
  if (premiere === "") return null;
  return ipAddressKey(premiere);
}
