import { describe, expect, it } from "vitest";
import { hashBytes } from "@/lib/poster/hash";

describe("hashBytes", () => {
  it("같은 바이트는 같은 해시를, 다른 바이트는 다른 해시를 낸다", async () => {
    const a = new TextEncoder().encode("poster-a").buffer;
    const b = new TextEncoder().encode("poster-b").buffer;
    const hashA1 = await hashBytes(a);
    const hashA2 = await hashBytes(a);
    const hashB = await hashBytes(b);
    expect(hashA1).toBe(hashA2);
    expect(hashA1).not.toBe(hashB);
    expect(hashA1).toMatch(/^[0-9a-f]{64}$/);
  });
});
