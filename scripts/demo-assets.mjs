import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { chromium } from "playwright";

const report = process.argv[2];
if (!report) throw new Error("Pass an existing demo report.html");
await mkdir("docs", { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.resolve(report)).href);
  await page.screenshot({ path: "docs/demo.png", fullPage: true });
} finally { await browser.close(); }
