import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { capturePage } from "./capture.js";
import { reduceStructure } from "./reduce.js";
import { hasOverflow, matches, normalizeProfile, observe, sha256 } from "./witness.js";
import { renderReport } from "./report.js";

export const version = "0.1.0-alpha.2";
export { hasOverflow, matches, observe } from "./witness.js";

async function loadHtml(page, html) {
  await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 5000 });
  await page.waitForFunction(() => document.fonts.status === "loaded", null, { timeout: 5000 });
}

async function screenshot(page, selector, filename) {
  await page.locator(selector).scrollIntoViewIfNeeded({ timeout: 5000 });
  await page.evaluate(() => scrollTo({ left: 0, top: scrollY, behavior: "instant" }));
  await page.screenshot({ path: filename, animations: "disabled", timeout: 5000 });
}

async function offlineContext(browser, profile, documentUrl) {
  const context = await browser.newContext({ ...profile, javaScriptEnabled: false, serviceWorkers: "block" });
  const blocked = [];
  await context.route("**/*", route => {
    const url = route.request().url();
    if (url === documentUrl || url.startsWith("data:")) return route.continue();
    blocked.push(url); return route.abort();
  });
  return { context, blocked };
}

/** Capture the caller's existing Page without navigating, scrolling or closing it. */
export async function reduceOverflow({ page, selector, outputDir, profile, maxChecks = 500, maxDurationMs = 30000 }) {
  profile = normalizeProfile(profile);
  if (typeof selector !== "string" || !selector.trim()) throw new Error("A CSS selector is required");
  if (!Number.isInteger(maxChecks) || maxChecks < 1 || maxChecks > 10000) throw new Error("maxChecks must be 1..10000");
  if (!Number.isInteger(maxDurationMs) || maxDurationMs < 100 || maxDurationMs > 300000) throw new Error("maxDurationMs must be 100..300000");
  if (typeof outputDir !== "string" || !outputDir) throw new Error("outputDir is required");
  const browser = page.context().browser();
  if (!browser) throw new Error("A browser-backed Playwright Page is required");
  const out = path.resolve(outputDir);
  await mkdir(path.dirname(out), { recursive: true });
  await mkdir(out); // Existing output is never overwritten.
  const result = { schemaVersion: "breakcase/0.1", version, status: "error", selector, profile,
    browser: browser.version(), createdAt: new Date().toISOString(),
    witnessVersion: 2,
    witness: "right-side document overflow; same target text, box/text dimensions and visual viewport within 1 CSS pixel; same visual scale within 0.001",
    coordinates: "document-space; scroll position is recorded separately", warnings: [] };
  let working, reopened;
  async function finish(status, message) {
    result.status = status; result.message = message;
    await writeFile(path.join(out, "result.json"), JSON.stringify(result, null, 2) + "\n");
    await writeFile(path.join(out, "report.html"), renderReport(result));
    return result;
  }
  try {
    await page.waitForFunction(() => document.fonts.status === "loaded", null, { timeout: 5000 });
    result.before = await observe(page, selector);
    if (result.before.targetCount !== 1) return await finish("invalid-target", `Selector matched ${result.before.targetCount} elements; exactly one is required.`);
    if (!hasOverflow(result.before)) return await finish("no-overflow", "The selected element does not show the supported right-side document overflow.");
    await page.waitForTimeout(100);
    if (!matches(result.before, await observe(page, selector))) return await finish("unstable-source", "The selected layout changed between observations. Capture a settled state.");
    const captured = await capturePage(page);
    result.capture = { stylesheets: captured.stylesheets, images: captured.images,
      embeddedResourceCount: captured.embeddedResourceCount, corsFetchedStylesheets: captured.corsFetchedStylesheets };
    result.warnings = captured.warnings;
    if (captured.warnings.length) return await finish("capture-incomplete", "The page contains unsupported or unreadable capture content. No reproduction is claimed.");
    if (Buffer.byteLength(captured.html) > 10_000_000) return await finish("capture-incomplete", "Static capture exceeds the preview's 10 MB limit.");
    if (!matches(result.before, await observe(page, selector))) return await finish("unstable-source", "The selected layout changed during capture.");
    working = (await offlineContext(browser, profile)).context;
    const oracle = await working.newPage(), edit = await working.newPage();
    await loadHtml(oracle, captured.html);
    result.captured = await observe(oracle, selector);
    if (!matches(result.before, result.captured)) return await finish("capture-mismatch", "The offline capture did not preserve the selected layout. Check profile, resources or dynamic content.");
    await writeFile(path.join(out, "capture.html"), captured.html);
    await screenshot(oracle, selector, path.join(out, "capture.png"));
    const started = performance.now();
    const reduced = await reduceStructure({ html: captured.html, selector, page: edit, maxChecks, maxDurationMs,
      interesting: async html => { await loadHtml(oracle, html); return matches(result.before, await observe(oracle, selector)); } });
    result.reduction = { checks: reduced.checks, budgetLimited: reduced.budgetLimited,
      elapsedMs: Math.round(performance.now() - started), maxChecks, maxDurationMs };
    const filename = path.join(out, "repro.html");
    await writeFile(filename, reduced.html);
    await working.close(); working = null;
    const fileUrl = pathToFileURL(filename).href;
    const fresh = await offlineContext(browser, profile, fileUrl); reopened = fresh.context;
    const checkPage = await reopened.newPage(); await checkPage.goto(fileUrl, { timeout: 5000 });
    result.after = await observe(checkPage, selector);
    result.offline = { freshContext: true, scriptsDisabled: true, otherRequestsBlocked: fresh.blocked.length };
    if (!matches(result.before, result.after) || fresh.blocked.length) return await finish("capture-mismatch", "Fresh file reopening failed the selected witness or requested external resources.");
    await screenshot(checkPage, selector, path.join(out, "repro.png"));
    result.bytes = { captured: Buffer.byteLength(captured.html), reduced: Buffer.byteLength(reduced.html) };
    result.sha256 = { captured: sha256(captured.html), reduced: sha256(reduced.html) };
    return await finish("reproduced", result.bytes.reduced < result.bytes.captured
      ? "The smaller static file preserves the selected overflow in a fresh offline browser context."
      : "The captured static file preserves the selected overflow; no smaller candidate was accepted within the work budget.");
  } catch (error) {
    return await finish("error", error.message);
  } finally { await working?.close(); await reopened?.close(); }
}

/** Recheck a saved file against the original witness, without loading its scripts. */
export async function checkReproduction({ file, resultFile }) {
  const recorded = JSON.parse(await readFile(resultFile, "utf8"));
  if (recorded.schemaVersion !== "breakcase/0.1" || recorded.status !== "reproduced" || typeof recorded.selector !== "string") {
    throw new Error("Expected a successful breakcase/0.1 result.json");
  }
  if (![undefined, 1, 2].includes(recorded.witnessVersion)) throw new Error("Unsupported witness version");
  const visualViewportCompared = Number.isFinite(recorded.before?.visualViewportWidth) && Number.isFinite(recorded.before?.visualViewportScale);
  if (recorded.witnessVersion === 2 && !visualViewportCompared) throw new Error("Witness version 2 requires visual viewport width and scale");
  const profile = normalizeProfile(recorded.profile);
  const bytes = await readFile(file), fileUrl = pathToFileURL(path.resolve(file)).href;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, blocked } = await offlineContext(browser, profile, fileUrl);
    const page = await context.newPage(); await page.goto(fileUrl, { timeout: 5000 });
    const observation = await observe(page, recorded.selector);
    const reproduced = matches(recorded.before, observation) && blocked.length === 0;
    return { schemaVersion: "breakcase-check/0.1", version, status: reproduced ? "reproduced" : "not-reproduced",
      observation, browser: browser.version(), recordedBrowser: recorded.browser,
      recordedVersion: recorded.version, witnessVersion: recorded.witnessVersion ?? 1, visualViewportCompared,
      sameBytes: sha256(bytes) === recorded.sha256.reduced, otherRequestsBlocked: blocked.length };
  } finally { await browser.close(); }
}
