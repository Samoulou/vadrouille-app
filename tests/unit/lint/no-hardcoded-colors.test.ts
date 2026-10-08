// @vitest-environment node
import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import rule from "../../../eslint-rules/no-hardcoded-colors.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run("ligne/no-hardcoded-colors", rule, {
  valid: [
    { code: `const a = <div className="bg-page text-ink border-border-control" />;` },
    { code: `const a = <div className="bg-line text-on-line rounded-control" />;` },
    { code: `const a = <a href="#main">x</a>;` },
    { code: `const s = { backgroundColor: "var(--color-quai)" };` },
    { code: "const s = { color: `var(--color-${name})` };" },
    { code: `const s = { color: "currentColor" };` },
    { code: `const a = <div className="tracking-[-0.02em] text-corps" />;` },
  ],
  invalid: [
    { code: `const a = <div className="bg-[#ff0000]" />;`, errors: [{ messageId: "hex" }] },
    { code: `const a = <div style={{ color: "#2a55d4" }} />;`, errors: [{ messageId: "hex" }] },
    { code: `const c = "rgb(0 0 0)";`, errors: [{ messageId: "fn" }] },
    { code: `const a = <div className="text-[oklch(0.5_0.1_200)]" />;`, errors: [{ messageId: "fn" }] },
    { code: `const a = <div className="border-[color:var(--x)]" />;`, errors: [{ messageId: "arbitrary" }] },
    { code: `const a = <div className="p-2 bg-[red]" />;`, errors: [{ messageId: "arbitrary" }] },
    { code: `const a = <div className="bg-red-500" />;`, errors: [{ messageId: "palette" }] },
    { code: `const a = <div className="text-white" />;`, errors: [{ messageId: "palette" }] },
    { code: "const a = `hover:bg-blue-600/50 ${x}`;", errors: [{ messageId: "palette" }] },
    { code: `const s = { backgroundColor: "red" };`, errors: [{ messageId: "named" }] },
  ],
});
