import { describe, expect, it } from "vitest";
import {
  chooseStageMode,
  computeGridLayout,
  type StageModeInput,
} from "../src/grid-layout";

describe("computeGridLayout — packing", () => {
  it("uses a single column for one tile", () => {
    const r = computeGridLayout(1, 1920, 1080);
    expect(r.cols).toBe(1);
    expect(r.rows).toBe(1);
    expect(r.tileWidth).toBeGreaterThan(0);
    expect(r.tileHeight).toBeGreaterThan(0);
  });

  it("places two tiles side-by-side in a landscape container", () => {
    const r = computeGridLayout(2, 1920, 1080);
    expect(r.cols).toBe(2);
    expect(r.rows).toBe(1);
  });

  it("keeps tiles aspect-locked to the target ratio (16:9)", () => {
    const r = computeGridLayout(4, 1600, 900);
    const ratio = r.tileWidth / r.tileHeight;
    expect(ratio).toBeGreaterThan(1.7);
    expect(ratio).toBeLessThan(1.85);
  });

  it("builds a balanced grid for four tiles in a square container", () => {
    const r = computeGridLayout(4, 1000, 1000);
    expect(r.cols).toBe(2);
    expect(r.rows).toBe(2);
    expect(r.lastRowCount).toBe(2);
  });

  it("reports a partial last row", () => {
    // 5 tiles, 3 cols → rows = 2, last row has 2.
    const r = computeGridLayout(5, 1800, 700, { maxCols: 3 });
    expect(r.cols).toBe(3);
    expect(r.rows).toBe(2);
    expect(r.lastRowCount).toBe(2);
  });

  it("never reports a lastRowCount below 1", () => {
    const r = computeGridLayout(3, 1200, 800, { maxCols: 3 });
    expect(r.lastRowCount).toBeGreaterThanOrEqual(1);
  });

  it("respects the maxCols cap", () => {
    const r = computeGridLayout(20, 4000, 400, { maxCols: 4 });
    expect(r.cols).toBeLessThanOrEqual(4);
  });
});

describe("computeGridLayout — paging", () => {
  it("reports a single page below the per-page cap", () => {
    const r = computeGridLayout(10, 1920, 1080, { maxTilesPerPage: 49 });
    expect(r.pages).toBe(1);
    expect(r.perPage).toBe(10);
  });

  it("splits into multiple pages above the cap", () => {
    const r = computeGridLayout(60, 1920, 1080, { maxTilesPerPage: 49 });
    expect(r.pages).toBe(2);
    expect(r.perPage).toBe(49);
  });
});

describe("computeGridLayout — degenerate inputs", () => {
  it("floors counts and treats <1 as a single tile", () => {
    const r = computeGridLayout(0, 1920, 1080);
    expect(r.perPage).toBe(1);
    expect(r.cols).toBe(1);
  });

  it("returns a zero-size single column for a zero-area container", () => {
    const r = computeGridLayout(4, 0, 0);
    expect(r.cols).toBe(1);
    expect(r.tileWidth).toBe(0);
    expect(r.tileHeight).toBe(0);
    expect(r.rows).toBe(4);
  });

  it("returns a single column for a non-finite container", () => {
    const r = computeGridLayout(4, Number.NaN, 1080);
    expect(r.cols).toBe(1);
    expect(r.tileWidth).toBe(0);
  });

  it("floors a fractional count", () => {
    const r = computeGridLayout(3.9, 1920, 1080);
    expect(r.perPage).toBe(3);
  });
});

describe("chooseStageMode", () => {
  const input = (overrides: Partial<StageModeInput> = {}): StageModeInput => ({
    count: 5,
    presenting: false,
    pinned: false,
    hasActiveVideoSpeaker: false,
    ...overrides,
  });

  it("spotlights a pinned tile regardless of count", () => {
    expect(chooseStageMode(input({ pinned: true, count: 20 }))).toBe("spotlight");
  });

  it("spotlights when two or fewer participants", () => {
    expect(chooseStageMode(input({ count: 2 }))).toBe("spotlight");
    expect(chooseStageMode(input({ count: 1 }))).toBe("spotlight");
  });

  it("spotlights a presentation with no active video speaker", () => {
    expect(
      chooseStageMode(input({ presenting: true, hasActiveVideoSpeaker: false })),
    ).toBe("spotlight");
  });

  it("uses side-by-side when presenting with an active video speaker", () => {
    expect(
      chooseStageMode(input({ presenting: true, hasActiveVideoSpeaker: true })),
    ).toBe("sideBySide");
  });

  it("tiles a mid-size meeting", () => {
    expect(chooseStageMode(input({ count: 8 }))).toBe("tiled");
  });

  it("switches to the sidebar above the tiled threshold", () => {
    expect(chooseStageMode(input({ count: 13 }))).toBe("sidebar");
  });

  it("honors a custom tiled threshold", () => {
    expect(chooseStageMode(input({ count: 5, tiledThreshold: 4 }))).toBe(
      "sidebar",
    );
  });
});
