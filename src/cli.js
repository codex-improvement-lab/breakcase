#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { checkReproduction, reduceOverflow } from "./index.js";

const help = `Breakcase — the bug fits in a file.

  breakcase install-browser
  breakcase demo --out ./demo-case
  breakcase reduce <URL-or-file> --selector '#target' --out ./case
  breakcase check ./case/repro.html --result ./case/result.json

Options:
  --viewport 390x844   CSS viewport; default narrow desktop 390x844
  --mobile             Mobile emulation (DPR 1, touch); explicit, never inferred
  --click <selector>    Click before capture; repeat in order
  --max-checks 500      Reduction checks; best accepted case survives the budget
  --max-ms 30000        Reduction time budget (not the entire command)
  --json               Compact machine-readable stdout; full result stays on disk

Existing output directories are refused. Source files are never edited.
Preview scope: static, selected right-side document overflow in Chromium.
`;

let browser;
let json = process.argv.includes("--json");
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    help: { type: "boolean", short: "h" }, version: { type: "boolean" },
    selector: { type: "string" }, out: { type: "string" }, result: { type: "string" },
    viewport: { type: "string", default: "390x844" }, mobile: { type: "boolean", default: false },
    click: { type: "string", multiple: true, default: [] }, "max-checks": { type: "string", default: "500" },
    "max-ms": { type: "string", default: "30000" }, json: { type: "boolean", default: false }
  } });
  json = values.json;
  const command = positionals[0];
  if (values.version) process.stdout.write("0.1.0-alpha.1\n");
  else if (values.help || !command || command === "help") process.stdout.write(help);
  else if (command === "install-browser") {
    if (positionals.length !== 1) throw new Error("install-browser accepts no positional arguments");
    const require = createRequire(import.meta.url);
    const cli = path.join(path.dirname(require.resolve("playwright/package.json")), "cli.js");
    const child = spawn(process.execPath, [cli, "install", "chromium", "--only-shell"],
      { shell: false, stdio: "inherit", env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_GC: "1" } });
    process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code ?? 2)); });
  } else {
    let result;
    if (command === "check") {
      if (positionals.length !== 2 || !values.result) throw new Error("check requires a file and --result result.json");
      result = await checkReproduction({ file: positionals[1], resultFile: values.result });
    } else if (command === "reduce" || command === "demo") {
      if (positionals.length !== (command === "demo" ? 1 : 2)) throw new Error("reduce requires exactly one URL or file");
      if (!values.out) throw new Error("An unused --out directory is required");
      const match = /^(\d+)x(\d+)$/.exec(values.viewport);
      if (!match) throw new Error("--viewport must look like 390x844");
      const profile = { viewport: { width: Number(match[1]), height: Number(match[2]) },
        deviceScaleFactor: 1, isMobile: values.mobile, hasTouch: values.mobile };
      const selector = command === "demo" ? "#release-key" : values.selector;
      if (!selector) throw new Error("--selector is required");
      const input = command === "demo" ? fileURLToPath(new URL("../examples/demo.html", import.meta.url)) : positionals[1];
      const url = /^(https?|file):/i.test(input) ? input : pathToFileURL(path.resolve(input)).href;
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext(profile);
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "load", timeout: 30000 });
      for (const click of values.click) await page.locator(click).click({ timeout: 5000 });
      result = await reduceOverflow({ page, selector, outputDir: values.out, profile,
        maxChecks: Number(values["max-checks"]), maxDurationMs: Number(values["max-ms"]) });
    } else throw new Error(`Unknown command: ${command}`);
    const output = values.out ? path.resolve(values.out) : undefined;
    const summary = { status: result.status, message: result.message, output,
      bytes: result.bytes, reduction: result.reduction, sameBytes: result.sameBytes,
      otherRequestsBlocked: result.otherRequestsBlocked,
      report: output ? path.join(output, "report.html") : undefined,
      result: output ? path.join(output, "result.json") : undefined };
    if (json) process.stdout.write(JSON.stringify(summary) + "\n");
    else process.stdout.write(`${result.status}: ${result.message ?? "Saved witness checked."}\n${output ? `Report: ${path.join(output, "report.html")}\n` : ""}`);
    process.exitCode = result.status === "reproduced" ? 0 : ["no-overflow", "not-reproduced"].includes(result.status) ? 1 : 2;
  }
} catch (error) {
  const message = error.message;
  if (json) process.stdout.write(JSON.stringify({ status: "error", message }) + "\n");
  else process.stderr.write(`Breakcase: ${message}\n`);
  process.exitCode = 2;
} finally { await browser?.close(); }
