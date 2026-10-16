import { describe, expect, it } from "vite-plus/test";
import {
  clampThreadSidebarWidth,
  resolveThreadSidebarFitWidth,
  resolveThreadSidebarMaximumWidth,
  resolveThreadSidebarMinimumWidth,
  resolveThreadSidebarPreferredWidth,
  THREAD_SIDEBAR_MIN_WIDTH,
} from "./threadSidebarWidth";

describe("resolveThreadSidebarMinimumWidth", () => {
  it("keeps the default minimum when the brand fits", () => {
    expect(resolveThreadSidebarMinimumWidth(0)).toBe(THREAD_SIDEBAR_MIN_WIDTH);
    expect(resolveThreadSidebarMinimumWidth(194)).toBe(THREAD_SIDEBAR_MIN_WIDTH);
  });

  it("grows to a brand wider than the default, rounding up", () => {
    expect(resolveThreadSidebarMinimumWidth(237.2)).toBe(238);
  });
});

describe("resolveThreadSidebarMaximumWidth", () => {
  it("never drops below a raised minimum on a narrow viewport", () => {
    expect(resolveThreadSidebarMaximumWidth(800, 238)).toBe(238);
    expect(resolveThreadSidebarMaximumWidth(1200, 238)).toBe(560);
  });
});

describe("clampThreadSidebarWidth", () => {
  it("widens a stored width below a raised minimum", () => {
    expect(clampThreadSidebarWidth(208, 238, 560)).toBe(238);
  });

  it("keeps widths inside the range and caps wide ones", () => {
    expect(clampThreadSidebarWidth(300, 238, 560)).toBe(300);
    expect(clampThreadSidebarWidth(900, 238, 560)).toBe(560);
  });
});

describe("resolveThreadSidebarFitWidth", () => {
  it("keeps the preferred width while the main panel has its comfortable width", () => {
    expect(resolveThreadSidebarFitWidth(300, 300 + 832)).toBe(300);
    expect(resolveThreadSidebarFitWidth(300, 1600)).toBe(300);
  });

  it("gives up half of every pixel the window loses below that", () => {
    expect(resolveThreadSidebarFitWidth(300, 300 + 832 - 100)).toBe(250);
    expect(resolveThreadSidebarFitWidth(300, 300 + 832 - 101)).toBe(249.5);
  });

  it("inverts a drag back into the preference that shows it", () => {
    for (const available of [900, 1000, 1132, 1500]) {
      for (const width of [208, 260, 300, 420]) {
        const preferred = resolveThreadSidebarPreferredWidth(width, available);
        expect(resolveThreadSidebarFitWidth(preferred, available)).toBe(width);
      }
    }
  });
});
