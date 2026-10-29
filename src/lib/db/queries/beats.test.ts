import { describe, expect, it } from "vitest";
import { orderBeatIds } from "./beats";

describe("orderBeatIds", () => {
  it("uses the requested order", () => {
    expect(orderBeatIds([1, 2, 3], [3, 1, 2])).toEqual([3, 1, 2]);
  });

  it("ignores ids from other scripts and duplicates", () => {
    expect(orderBeatIds([1, 2, 3], [2, 99, 2, 1, 3])).toEqual([2, 1, 3]);
  });

  it("keeps beats missing from the request at the end, in their current order", () => {
    expect(orderBeatIds([1, 2, 3, 4], [4, 2])).toEqual([4, 2, 1, 3]);
    expect(orderBeatIds([5, 6], [])).toEqual([5, 6]);
  });
});
