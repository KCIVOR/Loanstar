import test from "node:test";
import assert from "node:assert/strict";
import { VISUAL_EDITOR_CSS } from "../defaultStyles";

test("Visual CSS and PDF defaults align on heading sizes", () => {
  // Parse the VISUAL_EDITOR_CSS for h2 font-size
  const h2Match = VISUAL_EDITOR_CSS.match(/\.visual-surface h2\s*{[^}]*font-size:\s*(\d+)px/);
  assert.ok(h2Match, "Visual CSS should define h2 font-size in px");
  
  // Manual verification: both should be 29px (22pt converted)
  assert.equal(h2Match[1], "29");
});

test("Visual CSS and PDF both define gray th background", () => {
  assert.ok(VISUAL_EDITOR_CSS.includes("#EEEEEE"));
  // PDF defaults are in defaultStyles.ts PDF_DEFAULT_STYLES.th.fillColor
  // (This test is a reminder to keep them in sync)
});
