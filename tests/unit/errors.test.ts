import { describe, expect, it } from "vitest";
import { isDuplicateKeyError } from "@/lib/errors";

describe("isDuplicateKeyError", () => {
  it("23505(unique violation)면 true", () => {
    expect(isDuplicateKeyError({ code: "23505" })).toBe(true);
  });

  it("다른 코드·null·undefined는 false", () => {
    expect(isDuplicateKeyError({ code: "23503" })).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
    expect(isDuplicateKeyError(undefined)).toBe(false);
    expect(isDuplicateKeyError({})).toBe(false);
  });
});
