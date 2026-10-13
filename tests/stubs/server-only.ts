// Remplace le paquet `server-only` dans Vitest : hors du rendu serveur de Next.js, son import lève une erreur.
// La règle ESLint « server-only obligatoire » (tests/unit/lint/server-only-lint.test.ts) garde l'import dans le code.
export {};
