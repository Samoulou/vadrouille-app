import { describe, expect, it } from "vitest";

import { formatDuree } from "./duree";

describe("formatDuree", () => {
  it.each([
    [10, "10 min"],
    [45, "45 min"],
    [60, "1 h"],
    [90, "1 h 30"],
    [65, "1 h 05"],
    [150, "2 h 30"],
    [0, "0 min"],
  ])("%i min → « %s »", (minutes, attendu) => {
    expect(formatDuree(minutes)).toBe(attendu);
  });
});
