import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { checkReproduction, reduceOverflow } from "../src/index.js";
import { matches, observe, sha256 } from "../src/witness.js";

const profile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 };
let browser, temp;
before(async () => { temp = await mkdtemp(path.join(tmpdir(), "breakcase-test-")); browser = await chromium.launch(); });
after(async () => {
  await browser?.close();
  if (temp && path.dirname(path.resolve(temp)) === path.resolve(tmpdir()) && path.basename(temp).startsWith("breakcase-test-")) {
    await rm(temp, { recursive: true, force: true });
  }
});
async function source(html) {
  const context = await browser.newContext(profile), page = await context.newPage();
  await page.setContent(html);
  return { context, page };
}
const fixture = '<!doctype html><style>body{margin:0}#target{width:700px;font:16px/24px monospace}</style><div id="target">Preserve this selected overflow.</div>';

test("complete live-state workflow, fresh check, changed-file negative, caller preserved", async () => {
  const html = await readFile(new URL("../examples/demo.html", import.meta.url), "utf8");
  const { context, page } = await source(html);
  await page.evaluate(() => scrollTo({ left: 80, top: 100, behavior: "instant" }));
  const before = await page.content(), position = await page.evaluate(() => [scrollX, scrollY]);
  const outputDir = path.join(temp, "complete");
  const result = await reduceOverflow({ page, selector: "#release-key", profile, outputDir });
  assert.equal(result.status, "reproduced", result.message);
  assert.ok(result.bytes.reduced < result.bytes.captured / 2);
  assert.deepEqual(await page.evaluate(() => [scrollX, scrollY]), position);
  assert.equal(await page.content(), before);
  assert.equal(page.isClosed(), false);
  const file = path.join(outputDir, "repro.html"), resultFile = path.join(outputDir, "result.json");
  const checked = await checkReproduction({ file, resultFile });
  assert.equal(checked.status, "reproduced"); assert.equal(checked.sameBytes, true);
  const changed = path.join(temp, "fixed.html");
  await writeFile(changed, (await readFile(file, "utf8")) + '<style>main{min-width:0!important}#release-key{white-space:normal!important;overflow-wrap:anywhere!important}</style>');
  assert.equal((await checkReproduction({ file: changed, resultFile })).status, "not-reproduced");
  await assert.rejects(reduceOverflow({ page, selector: "#release-key", profile, outputDir }), /EEXIST/);
  await context.close();
});

test("healthy page, hidden target and intentional scrolling are not selected failures", async () => {
  const cases = [
    '<div id="target">Healthy wrapping text</div>',
    '<div style="opacity:0"><div id="target" style="width:700px">Hidden</div></div>',
    '<div style="width:120px;overflow:auto"><div id="target" style="width:700px">Intentionally scrollable</div></div><div style="width:900px">Another overflow must not implicate the target</div>'
  ];
  for (const [i, html] of cases.entries()) {
    const { context, page } = await source(html);
    const result = await reduceOverflow({ page, selector: "#target", profile, outputDir: path.join(temp, `negative-${i}`) });
    assert.equal(result.status, "no-overflow"); await context.close();
  }
});

test("missing and ambiguous targets do not produce a successful artifact", async () => {
  const { context, page } = await source(fixture);
  for (const [i, selector] of ["#missing", "body, #target"].entries()) {
    const result = await reduceOverflow({ page, selector, profile, outputDir: path.join(temp, `selector-${i}`) });
    assert.equal(result.status, "invalid-target");
  }
  await context.close();
});

test("unsupported content is explicit, and a bounded run retains its accepted witness", async () => {
  const { context, page } = await source(fixture + '<iframe src="about:blank"></iframe>');
  const incomplete = await reduceOverflow({ page, selector: "#target", profile, outputDir: path.join(temp, "unsupported") });
  assert.equal(incomplete.status, "capture-incomplete");
  assert.ok(incomplete.warnings.some(item => item.kind === "unsupported-frames"));
  await page.setContent(fixture + Array.from({ length: 20 }, (_, i) => `<p>Noise ${i}</p>`).join(""));
  const bounded = await reduceOverflow({ page, selector: "#target", profile, outputDir: path.join(temp, "bounded"), maxChecks: 1 });
  assert.equal(bounded.status, "reproduced", bounded.message);
  assert.equal(bounded.reduction.checks, 1); assert.equal(bounded.reduction.budgetLimited, true);
  await context.close();
});

test("external stylesheet/image and live controls survive capture after source service stops", async () => {
  const routes = {
    "/": '<!doctype html><link rel="stylesheet" href="/style.css"><div id="target">Keep this overflow.</div><textarea id="text">old</textarea><input id="check" type="checkbox"><select id="select"><option>a</option><option>b</option></select><img id="image" src="/image.svg">',
    "/style.css": 'body{margin:0}#target{width:700px;font:16px/24px monospace;background-image:url("/image.svg")}',
    "/image.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect width="12" height="12" fill="red"/></svg>'
  };
  const server = createServer((req, res) => {
    res.writeHead(routes[req.url] ? 200 : 404, { "Content-Type": req.url.endsWith("css") ? "text/css" : req.url.endsWith("svg") ? "image/svg+xml" : "text/html" });
    res.end(routes[req.url] || "missing");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const context = await browser.newContext(profile), page = await context.newPage();
  let stopped = false;
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator("#text").fill("edited live value"); await page.locator("#check").check(); await page.locator("#select").selectOption("b");
    const outputDir = path.join(temp, "resources");
    const result = await reduceOverflow({ page, selector: "#target", profile, outputDir });
    assert.equal(result.status, "reproduced", result.message);
    await context.close(); await new Promise(resolve => server.close(resolve)); stopped = true;
    const offline = await browser.newContext({ ...profile, javaScriptEnabled: false });
    const doc = pathToFileURL(path.join(outputDir, "capture.html")).href, blocked = [];
    await offline.route("**/*", route => {
      const url = route.request().url();
      if (url === doc || url.startsWith("data:")) return route.continue();
      blocked.push(url); return route.abort();
    });
    const opened = await offline.newPage(); await opened.goto(doc);
    assert.equal(await opened.locator("#text").inputValue(), "edited live value");
    assert.equal(await opened.locator("#check").isChecked(), true);
    assert.equal(await opened.locator("#select").inputValue(), "b");
    assert.equal(await opened.locator("#image").evaluate(img => img.naturalWidth), 12);
    assert.deepEqual(blocked, []); await offline.close();
  } finally { await context.close(); if (!stopped) await new Promise(resolve => server.close(resolve)); }
});

test("historical Proofline renderer regression and actual fixed renderer", async () => {
  const selector = '[data-change-id="PERF-01"] .contract-after strong';
  for (const mode of ["broken", "fixed"]) {
    const filename = new URL(`fixtures/proofline-${mode}.html`, import.meta.url);
    const html = await readFile(filename, "utf8"), hash = sha256(html);
    const { context, page } = await source(html);
    const result = await reduceOverflow({ page, selector, profile, outputDir: path.join(temp, `historical-${mode}`) });
    assert.equal(result.status, mode === "broken" ? "reproduced" : "no-overflow", result.message);
    assert.equal(sha256(await readFile(filename, "utf8")), hash);
    await context.close();
  }
});

test("CORS-readable linked CSS survives redirect/resources; denied or oversized CSS stays explicit", async () => {
  const requests = [];
  const css = 'body{margin:0}#target{width:700px;font:16px/24px monospace;background-image:url("tile.svg")}';
  const assetServer = createServer((req, res) => {
    requests.push({ url: req.url, mode: req.headers["sec-fetch-mode"], cookie: Boolean(req.headers.cookie) });
    const cors = req.url !== "/denied.css" ? { "Access-Control-Allow-Origin": "*" } : {};
    if (req.url === "/redirect.css") { res.writeHead(302, { ...cors, Location: "/nested/style.css" }); res.end(); return; }
    if (req.url === "/nested/tile.svg") {
      res.writeHead(200, { ...cors, "Content-Type": "image/svg+xml" });
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect width="12" height="12" fill="red"/></svg>'); return;
    }
    res.writeHead(200, { ...cors, "Content-Type": "text/css; charset=utf-8" });
    res.end(req.url === "/large.css" ? css + "/*" + "x".repeat(5_000_001) + "*/" : css);
  });
  await new Promise(resolve => assetServer.listen(0, "127.0.0.1", resolve));
  const assetUrl = `http://127.0.0.1:${assetServer.address().port}`;
  const site = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    const route = req.url === "/denied" ? "/denied.css" : req.url === "/large" ? "/large.css" : "/redirect.css";
    res.end(`<!doctype html><meta charset="utf-8"><link rel="stylesheet" media="screen" href="${assetUrl}${route}"><div id="target">Cross-origin stylesheet fixture.</div>`);
  });
  await new Promise(resolve => site.listen(0, "127.0.0.1", resolve));
  const siteUrl = `http://127.0.0.1:${site.address().port}`;
  const context = await browser.newContext(profile), page = await context.newPage();
  await context.addCookies([{ name: "test_session", value: "fixture-only", domain: "127.0.0.1", path: "/" }]);
  let stopped = false;
  try {
    await page.goto(siteUrl);
    assert.equal(await page.evaluate(() => { try { return Boolean(document.styleSheets[0].cssRules); } catch { return false; } }), false);
    const before = await page.content();
    const outputDir = path.join(temp, "cors-css");
    const result = await reduceOverflow({ page, selector: "#target", profile, outputDir });
    assert.equal(result.status, "reproduced", result.message);
    assert.equal(result.capture.corsFetchedStylesheets, 1);
    assert.equal(await page.content(), before);
    const captured = await readFile(path.join(outputDir, "capture.html"), "utf8");
    assert.match(captured, /data:image\/svg\+xml;base64,/);
    assert.ok(requests.some(r => r.url === "/nested/tile.svg" && r.mode === "cors"));
    assert.ok(requests.filter(r => r.mode === "cors").every(r => !r.cookie));
    for (const route of ["denied", "large"]) {
      await page.goto(`${siteUrl}/${route}`);
      const refused = await reduceOverflow({ page, selector: "#target", profile, outputDir: path.join(temp, `cors-${route}`) });
      assert.equal(refused.status, "capture-incomplete");
      assert.ok(refused.warnings.some(w => w.kind === "stylesheet-not-readable"));
    }
    await context.close();
    await Promise.all([new Promise(resolve => site.close(resolve)), new Promise(resolve => assetServer.close(resolve))]); stopped = true;
    const checked = await checkReproduction({ file: path.join(outputDir, "repro.html"), resultFile: path.join(outputDir, "result.json") });
    assert.equal(checked.status, "reproduced"); assert.equal(checked.sameBytes, true);
  } finally {
    await context.close();
    if (!stopped) await Promise.all([new Promise(resolve => site.close(resolve)), new Promise(resolve => assetServer.close(resolve))]);
  }
});

test("mobile file recheck rejects zoom changes that preserve the layout viewport", async () => {
  const mobile = { ...profile, isMobile: true, hasTouch: true };
  const context = await browser.newContext(mobile), page = await context.newPage();
  await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' + fixture);
  const outputDir = path.join(temp, "mobile-viewport");
  try {
    const result = await reduceOverflow({ page, selector: "#target", profile: mobile, outputDir });
    assert.equal(result.status, "reproduced", result.message);
    assert.equal(result.witnessVersion, 3);
    const file = path.join(outputDir, "repro.html"), resultFile = path.join(outputDir, "result.json");
    const original = await checkReproduction({ file, resultFile });
    assert.equal(original.status, "reproduced"); assert.equal(original.visualViewportCompared, true);
    assert.equal(original.documentWidthCapCompared, true);
    const scaledFile = path.join(temp, "mobile-autoscale.html");
    await writeFile(scaledFile, (await readFile(file, "utf8")).replace("width=device-width,initial-scale=1", "width=device-width"));
    const scaled = await checkReproduction({ file: scaledFile, resultFile });
    assert.equal(scaled.observation.viewportWidth, result.before.viewportWidth);
    assert.equal(scaled.observation.textSha256, result.before.textSha256);
    assert.notEqual(scaled.observation.visualViewportScale, result.before.visualViewportScale);
    assert.equal(scaled.status, "not-reproduced");
    const legacy = structuredClone(result); delete legacy.witnessVersion;
    delete legacy.before.visualViewportWidth; delete legacy.before.visualViewportScale;
    const legacyFile = path.join(temp, "legacy-witness.json"); await writeFile(legacyFile, JSON.stringify(legacy));
    const legacyCheck = await checkReproduction({ file, resultFile: legacyFile });
    assert.equal(legacyCheck.status, "reproduced"); assert.equal(legacyCheck.visualViewportCompared, false);
    assert.equal(legacyCheck.documentWidthCapCompared, false);
    legacy.witnessVersion = 2; await writeFile(legacyFile, JSON.stringify(legacy));
    await assert.rejects(checkReproduction({ file, resultFile: legacyFile }), /requires visual viewport/);
  } finally { await context.close(); }
});

test("new witness rejects a wider unrelated overflow; earlier records retain their saved scope", async () => {
  const { context, page } = await source(fixture);
  try {
    const outputDir = path.join(temp, "document-width-cap");
    const result = await reduceOverflow({ page, selector: "#target", profile, outputDir });
    assert.equal(result.status, "reproduced", result.message);
    assert.equal(result.witnessVersion, 3);
    const file = path.join(outputDir, "repro.html"), resultFile = path.join(outputDir, "result.json");
    const widerFile = path.join(temp, "added-unrelated-overflow.html");
    await writeFile(widerFile, (await readFile(file, "utf8")) + '<div style="width:1100px;height:1px"></div>');
    const fresh = await browser.newContext(profile), widened = await fresh.newPage();
    try {
      await widened.goto(pathToFileURL(widerFile).href);
      const after = await observe(widened, "#target");
      assert.equal(after.textSha256, result.before.textSha256);
      assert.equal(after.width, result.before.width);
      assert.equal(after.effectiveRight, result.before.effectiveRight);
      assert.ok(after.documentWidth > result.before.documentWidth + 1);
      assert.equal(matches(result.before, after), false);
      assert.equal(matches(result.before, after, { documentWidthCap: false }), true);
    } finally { await fresh.close(); }
    const newCheck = await checkReproduction({ file: widerFile, resultFile });
    assert.equal(newCheck.status, "not-reproduced");
    assert.equal(newCheck.documentWidthCapCompared, true);
    const old = structuredClone(result); old.witnessVersion = 2; old.version = "0.1.0-alpha.2";
    const oldFile = path.join(temp, "v2-witness.json"); await writeFile(oldFile, JSON.stringify(old));
    const oldCheck = await checkReproduction({ file: widerFile, resultFile: oldFile });
    assert.equal(oldCheck.status, "reproduced");
    assert.equal(oldCheck.visualViewportCompared, true);
    assert.equal(oldCheck.documentWidthCapCompared, false);
    const malformed = structuredClone(result); delete malformed.before.documentWidth;
    await writeFile(oldFile, JSON.stringify(malformed));
    await assert.rejects(checkReproduction({ file, resultFile: oldFile }), /requires original document width/);
  } finally { await context.close(); }
});

test("document-width cap permits removing a wider unrelated overflow", async () => {
  const { context, page } = await source(fixture + '<div style="width:1100px;height:1px"></div>');
  try {
    const before = await observe(page, "#target");
    await page.setContent(fixture);
    const after = await observe(page, "#target");
    assert.ok(after.documentWidth < before.documentWidth);
    assert.equal(matches(before, after), true);
  } finally { await context.close(); }
});
