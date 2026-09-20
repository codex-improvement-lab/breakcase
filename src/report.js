const escape = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const kb = value => `${(value / 1024).toFixed(1)} KB`;

export function renderReport(result) {
  const success = result.status === "reproduced";
  return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Breakcase · ${escape(result.status)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f0e6;color:#272621;font:16px/1.6 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:48px 24px}header{border-bottom:2px solid;padding-bottom:28px}.brand{font-size:13px;letter-spacing:.2em;font-weight:750}h1{font-size:clamp(36px,7vw,72px);letter-spacing:-.055em;line-height:1.05;margin:20px 0}p{max-width:760px}.status{display:inline-block;background:#ff6a3d;color:#241d18;padding:4px 12px;border-radius:3px;font:700 12px/1.7 monospace;text-transform:uppercase}.stats,.frames{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:28px 0}.stat{border-top:1px solid #aaa;padding-top:12px}.stat b{display:block;font-size:36px;letter-spacing:-.04em}figure{margin:0;min-width:0;background:#ddd8ce;padding:16px;border-radius:8px}figcaption{font-size:13px;font-weight:700;margin-bottom:16px}img{max-width:100%;max-height:640px;object-fit:contain;object-position:top;display:block;margin:auto}a{color:inherit;text-decoration-thickness:2px;text-underline-offset:4px}code{overflow-wrap:anywhere;font-size:13px}footer{border-top:1px solid #aaa;margin-top:40px;padding-top:20px;font-size:13px;color:#59564d}@media(max-width:680px){.frames{grid-template-columns:1fr}main{padding:28px 18px}}
</style><main><header><div class="brand">BREAKCASE / A SMALLER WAY TO SHOW THE BREAK</div><h1>${success ? "The bug fits<br>in a file." : "No reproduction claimed."}</h1><span class="status">${escape(result.status)}</span><p>${escape(result.message)}</p></header>
${success ? `<section class="stats"><div class="stat">Captured page<b>${kb(result.bytes.captured)}</b>${result.before.nodes} elements</div><div class="stat">Runnable reproduction<b>${kb(result.bytes.reduced)}</b>${result.after.nodes} elements · ${result.reduction.checks} checks</div></section>
<p><a href="repro.html">Open the reduced case ↗</a> · <a href="result.json">Read the measurements</a></p>
<section class="frames"><figure><figcaption>CAPTURED STATE / ${result.profile.viewport.width}px</figcaption><img src="capture.png" alt="Captured page at the selected viewport"></figure><figure><figcaption>REDUCED / FAILURE STILL OBSERVED</figcaption><img src="repro.png" alt="Reduced page at the same viewport"></figure></section>` : ""}
<p>Target: <code>${escape(result.selector)}</code></p><footer>One selected horizontal layout witness, checked in ${escape(result.browser || "Chromium")}. This is a static reproduction, not a full application replay or proof of root cause. Review page data before sharing. ${result.reduction?.budgetLimited ? "Reduction reached its work budget; the best accepted case is retained." : ""}</footer></main></html>`;
}
