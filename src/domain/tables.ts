/**
 * Lecture d'une table par clé, sans accès calculé `table[cle]` (revue Sécurité de #180, bloquant 1 : le contrôle
 * des imports refuse tout accès `x[expr]` non littéral). Seules les propriétés propres et énumérables sont vues :
 * une clé comme `constructor` ou `__proto__` ne remonte jamais au prototype.
 */
export function lireSiPresent<K extends string, V>(table: Readonly<Partial<Record<K, V>>>, cle: K): V | undefined {
  for (const [nom, valeur] of Object.entries(table) as [string, V | undefined][]) if (nom === cle) return valeur;
  return undefined;
}

/** Comme `lireSiPresent`, pour une table complète : une clé absente est une erreur de programmation. */
export function lire<K extends string, V>(table: Readonly<Record<K, V>>, cle: K): V {
  const valeur = lireSiPresent<K, V>(table, cle);
  if (valeur === undefined) throw new Error(`clé absente de la table : ${cle}`);
  return valeur;
}

/** Élément d'un tableau, avec la sémantique de `tableau[index]` : `undefined` hors des bornes ou pour un index non entier. */
export function element<T>(tableau: readonly T[], index: number): T | undefined {
  return Number.isInteger(index) && index >= 0 ? tableau.at(index) : undefined;
}
