import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { checkReproduction, reduceOverflow } from "../src/index.js";
import { sha256 } from "../src/witness.js";

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
