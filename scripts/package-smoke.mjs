import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const tarball = process.argv.slice(2).filter(arg => arg !== "--")[0];
if (!tarball || !process.env.npm_execpath) throw new Error("Run pnpm smoke <tarball>");
const temp = await mkdtemp(path.join(tmpdir(), "breakcase-package-"));
async function run(executable, args, cwd, expected = 0) {
  const logs = [], child = spawn(executable, args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", chunk => logs.push(chunk)); child.stderr.on("data", chunk => logs.push(chunk));
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  const text = Buffer.concat(logs).toString("utf8");
  assert.equal(code, expected, text); return text;
}
try {
  await writeFile(path.join(temp, "package.json"), '{"name":"breakcase-clean-smoke","version":"0.0.0","private":true}\n');
  await run(process.execPath, [process.env.npm_execpath, "add", path.resolve(tarball), "--ignore-scripts"], temp);
  const require = createRequire(path.join(temp, "package.json"));
  const entry = require.resolve("@codex-improvement-lab/breakcase");
  // macOS temporary paths may use /var while module resolution uses /private/var.
  const installedRoot = await realpath(path.join(temp, "node_modules"));
  const relativeEntry = path.relative(installedRoot, await realpath(entry));
  assert.ok(relativeEntry && relativeEntry !== ".." && !relativeEntry.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeEntry));
  const cli = path.join(path.dirname(entry), "cli.js");
  const packageRoot = path.dirname(path.dirname(entry));
  const metadata = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  assert.equal((await run(process.execPath, [cli, "--version"], temp)).trim(), metadata.version);
  await readFile(path.join(packageRoot, "docs/historical-cases.md"), "utf8");
  JSON.parse(await readFile(path.join(packageRoot, "docs/evidence/historical-cases-2026-09-21.json"), "utf8"));
  const out = path.join(temp, "case");
  const demo = JSON.parse(await run(process.execPath, [cli, "demo", "--out", out, "--json"], temp));
  assert.equal(demo.status, "reproduced");
  assert.equal(demo.version, metadata.version);
  const checked = JSON.parse(await run(process.execPath, [cli, "check", path.join(out, "repro.html"), "--result", path.join(out, "result.json"), "--json"], temp));
  assert.equal(checked.status, "reproduced"); assert.equal(checked.sameBytes, true);
  assert.equal(checked.visualViewportCompared, true); assert.equal(checked.witnessVersion, 3);
  assert.equal(checked.documentWidthCapCompared, true);
  const legacy = JSON.parse(await readFile(path.join(out, "result.json"), "utf8"));
  delete legacy.witnessVersion; delete legacy.before.visualViewportWidth; delete legacy.before.visualViewportScale;
  legacy.version = "0.1.0-alpha.1"; legacy.witness = "Legacy layout dimensions";
  const legacyFile = path.join(temp, "legacy.json"); await writeFile(legacyFile, JSON.stringify(legacy));
  const legacyCheck = JSON.parse(await run(process.execPath, [cli, "check", path.join(out, "repro.html"), "--result", legacyFile, "--json"], temp));
  assert.equal(legacyCheck.status, "reproduced"); assert.equal(legacyCheck.visualViewportCompared, false);
  assert.equal(legacyCheck.documentWidthCapCompared, false);
  assert.equal(legacyCheck.witnessVersion, 1);
  const refused = JSON.parse(await run(process.execPath, [cli, "demo", "--out", out, "--json"], temp, 2));
  assert.equal(refused.status, "error"); assert.match(refused.message, /EEXIST/);
  process.stdout.write(JSON.stringify({ packedInstall: "passed", demo: demo.status, check: checked.status,
    existingOutputRefused: true, bytes: demo.bytes }) + "\n");
} finally {
  if (path.dirname(path.resolve(temp)) === path.resolve(tmpdir()) && path.basename(temp).startsWith("breakcase-package-")) {
    await rm(temp, { recursive: true, force: true });
  }
}
