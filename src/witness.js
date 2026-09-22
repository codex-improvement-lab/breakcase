import { createHash } from "node:crypto";

export const sha256 = value => createHash("sha256").update(value).digest("hex");

// This callback is deliberately self-contained: it runs inside the browser.
export async function observe(page, selector) {
  const value = await page.evaluate(selector => {
    const targets = document.querySelectorAll(selector);
    if (targets.length !== 1) return { targetCount: targets.length };
    const target = targets[0], rect = target.getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(target);
    const text = range.getBoundingClientRect();
    let visible = rect.width > 0 && rect.height > 0;
    let right = Math.max(rect.right, text.right, rect.left + target.scrollWidth);
    const clipping = [];
    for (let node = target; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity) === 0) visible = false;
      if (["hidden", "clip", "auto", "scroll"].includes(style.overflowX)) {
        const edge = node.getBoundingClientRect().right;
        if (edge < right) clipping.push({ tag: node.localName, overflowX: style.overflowX });
        right = Math.min(right, edge);
      }
    }
    return { targetCount: 1, text: target.textContent,
      visible, left: rect.left + scrollX, width: rect.width, height: rect.height,
      textWidth: text.width, targetScrollWidth: target.scrollWidth,
      effectiveRight: right + scrollX, viewportWidth: document.documentElement.clientWidth,
      visualViewportWidth: window.visualViewport?.width ?? document.documentElement.clientWidth,
      visualViewportScale: window.visualViewport?.scale ?? 1,
      documentWidth: document.documentElement.scrollWidth, scrollX, scrollY, clipping,
      nodes: document.querySelectorAll("*").length };
  }, selector);
  if (value.targetCount === 1) {
    value.textSha256 = sha256(value.text);
    delete value.text;
  }
  return value;
}

export function hasOverflow(value) {
  return value.targetCount === 1 && value.visible === true
    && value.documentWidth > value.viewportWidth + 1
    && value.effectiveRight > value.viewportWidth + 1;
}

export function matches(before, after) {
  if (!hasOverflow(after) || after.textSha256 !== before.textSha256 || after.viewportWidth !== before.viewportWidth) return false;
  if (Number.isFinite(before.visualViewportWidth) && Number.isFinite(before.visualViewportScale)) {
    if (!Number.isFinite(after.visualViewportWidth) || !Number.isFinite(after.visualViewportScale)
      || Math.abs(before.visualViewportWidth - after.visualViewportWidth) > 1
      || Math.abs(before.visualViewportScale - after.visualViewportScale) > 0.001) return false;
  }
  return ["left", "width", "height", "textWidth", "targetScrollWidth", "effectiveRight"]
    .every(key => Number.isFinite(before[key]) && Number.isFinite(after[key]) && Math.abs(before[key] - after[key]) <= 1);
}

export function normalizeProfile(profile) {
  const width = profile?.viewport?.width, height = profile?.viewport?.height;
  if (![width, height].every(value => Number.isInteger(value) && value >= 100 && value <= 10000)) {
    throw new Error("profile.viewport must specify integer width and height between 100 and 10000");
  }
  const deviceScaleFactor = profile.deviceScaleFactor ?? 1;
  if (!Number.isFinite(deviceScaleFactor) || deviceScaleFactor < 0.5 || deviceScaleFactor > 4) throw new Error("Invalid deviceScaleFactor");
  const result = { viewport: { width, height }, deviceScaleFactor,
    isMobile: profile.isMobile === true, hasTouch: profile.hasTouch === true };
  if (profile.colorScheme !== undefined) {
    if (!["light", "dark", "no-preference"].includes(profile.colorScheme)) throw new Error("Invalid colorScheme");
    result.colorScheme = profile.colorScheme;
  }
  return result;
}
