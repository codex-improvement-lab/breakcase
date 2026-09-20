// Original Lab capture implementation. Static DOM/CSS, not application replay.
export async function capturePage(page) {
  const plan = await page.evaluate(() => ({
    base: location.href,
    styles: [...document.querySelectorAll('style,link[rel="stylesheet"]')].map((node, index) => {
      try { return { index, base: node.href || location.href, media: node.media || "",
        disabled: Boolean(node.sheet?.disabled), css: [...(node.sheet?.cssRules || [])].map(rule => rule.cssText).join("\n") }; }
      catch { return { index, unreadable: true }; }
    }),
    images: [...document.querySelectorAll("img")].map((node, index) => ({ index, url: node.currentSrc || node.src })),
    inlineStyles: [...document.querySelectorAll("[style]")].map((node, index) => ({ index, css: node.getAttribute("style") })),
    adoptedStylesheets: document.adoptedStyleSheets.length,
    frames: document.querySelectorAll("iframe,frame").length,
    shadowRoots: [...document.querySelectorAll("*")].filter(node => node.shadowRoot).length,
    canvases: document.querySelectorAll("canvas").length,
    media: document.querySelectorAll("video,audio,object,embed").length
  }));
  const warnings = [];
  for (const name of ["adoptedStylesheets", "frames", "shadowRoots", "canvases", "media"]) if (plan[name]) warnings.push({ kind: `unsupported-${name}`, count: plan[name] });
  const cache = new Map();
  async function inline(url, base) {
    if (!url || url.startsWith("#") || url.startsWith("data:")) return url;
    const absolute = new URL(url, base).href;
    if (!cache.has(absolute)) {
      cache.set(absolute, await page.evaluate(async url => {
        try {
          const response = await fetch(url, { credentials: "same-origin", signal: AbortSignal.timeout(5000) });
          if (!response.ok) return null;
          const blob = await response.blob();
          if (blob.size > 5_000_000) return null;
          return await new Promise((resolve, reject) => {
            const reader = new FileReader(); reader.onload = () => resolve(reader.result);
            reader.onerror = reject; reader.readAsDataURL(blob);
          });
        } catch { return null; }
      }, absolute));
    }
    if (!cache.get(absolute)) warnings.push({ kind: "resource-not-embedded", url: absolute });
    return cache.get(absolute) || absolute;
  }
  async function rewriteCss(css, base) {
    const regex = /url\(\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^)]*))\s*\)/g;
    const matches = [...css.matchAll(regex)];
    let result = css;
    for (const match of matches.reverse()) {
      const value = (match[1] ?? match[2] ?? match[3] ?? "").trim();
      const data = await inline(value, base);
      result = result.slice(0, match.index) + `url("${data.replaceAll('"', '%22')}")` + result.slice(match.index + match[0].length);
    }
    return result;
  }
  for (const style of plan.styles) {
    if (style.unreadable) { warnings.push({ kind: "stylesheet-not-readable", index: style.index }); continue; }
    if (/@import\b/i.test(style.css)) warnings.push({ kind: "unflattened-css-import", index: style.index });
    style.css = await rewriteCss(style.css, style.base);
  }
  for (const image of plan.images) image.data = await inline(image.url, plan.base);
  for (const style of plan.inlineStyles) style.css = await rewriteCss(style.css, plan.base);
  const html = await page.evaluate(plan => {
    const copy = document.documentElement.cloneNode(true);
    const originals = [...document.querySelectorAll("input,textarea,select")];
    const controls = [...copy.querySelectorAll("input,textarea,select")];
    originals.forEach((node, index) => {
      const target = controls[index];
      if (node.tagName === "TEXTAREA") target.textContent = node.value;
      else if (node.tagName === "SELECT") [...target.options].forEach((option, i) => option.toggleAttribute("selected", node.options[i].selected));
      else if (node.type !== "file") {
        target.setAttribute("value", node.type === "password" ? "" : node.value);
        target.toggleAttribute("checked", node.checked);
      }
    });
    const inlineNodes = [...copy.querySelectorAll("[style]")];
    for (const item of plan.inlineStyles) inlineNodes[item.index].setAttribute("style", item.css);
    const styles = [...copy.querySelectorAll('style,link[rel="stylesheet"]')];
    for (const item of plan.styles) {
      if (item.disabled) { styles[item.index].remove(); continue; }
      if (item.unreadable) continue;
      const style = document.createElement("style"); style.textContent = item.css;
      if (item.media) style.media = item.media;
      styles[item.index].replaceWith(style);
    }
    const images = [...copy.querySelectorAll("img")];
    for (const item of plan.images) {
      images[item.index].src = item.data;
      images[item.index].removeAttribute("srcset"); images[item.index].removeAttribute("loading");
    }
    for (const node of copy.querySelectorAll("picture source")) node.remove();
    for (const node of copy.querySelectorAll('script,base,link[rel="modulepreload"],link[rel="preload"],meta[http-equiv="refresh"]')) node.remove();
    for (const node of copy.querySelectorAll("*")) for (const attribute of [...node.attributes]) {
      if (attribute.name.toLowerCase().startsWith("on")) node.removeAttribute(attribute.name);
    }
    const csp = document.createElement("meta"); csp.httpEquiv = "Content-Security-Policy";
    csp.content = "default-src 'none'; style-src 'unsafe-inline' data:; img-src data:; font-src data:; form-action 'none'; base-uri 'none'";
    copy.querySelector("head").prepend(csp);
    return "<!doctype html>\n" + copy.outerHTML + "\n";
  }, plan);
  return { html, warnings, stylesheets: plan.styles.length, images: plan.images.length,
    embeddedResourceCount: [...cache.values()].filter(Boolean).length,
    boundary: "Static DOM/CSS state, not application behavior or a security-sanitization guarantee" };
}
