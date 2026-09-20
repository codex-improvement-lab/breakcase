// Original DOM/CSS remove-and-test reducer. No global-minimality guarantee.
export async function reduceStructure({ html, selector, page, interesting, maxChecks = 500, maxDurationMs = 30000 }) {
  let current = html, checks = 0, budgetLimited = false;
  const started = performance.now();
  const progress = [];
  async function keysFor(kind) {
    await page.setContent(current, { waitUntil: "domcontentloaded" });
    return page.evaluate(({ kind, selector }) => {
      const target = document.querySelector(selector);
      if (!target) throw new Error("Target is missing from the current accepted input");
      if (kind === "nodes") {
        const address = node => {
          if (node.id && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) return `#${CSS.escape(node.id)}`;
          if (node === document.body) return "body";
          const siblings = [...node.parentElement.children].filter(other => other.localName === node.localName);
          return `${address(node.parentElement)} > ${node.localName}:nth-of-type(${siblings.indexOf(node) + 1})`;
        };
        return [...document.body.querySelectorAll("*")].filter(node => !node.contains(target) && !target.contains(node)).map(address);
      }
      const result = [];
      const walk = (rules, prefix) => [...rules].forEach((rule, index) => {
        const key = [...prefix, index];
        if (kind === "rules") result.push(key);
        else if (rule.style) for (const property of rule.style) result.push([...key, property]);
        if (rule.cssRules) walk(rule.cssRules, key);
      });
      [...document.querySelectorAll("style")].forEach((style, sheet) => walk(style.sheet.cssRules, [sheet]));
      return result;
    }, { kind, selector });
  }
  async function candidate(kind, keys) {
    await page.setContent(current, { waitUntil: "domcontentloaded" });
    return page.evaluate(({ kind, keys }) => {
      if (kind === "nodes") {
        const nodes = keys.map(key => document.querySelector(key)).filter(Boolean);
        for (const node of nodes) node.remove();
      } else {
        const styles = [...document.querySelectorAll("style")];
        const container = key => {
          let value = styles[key[0]].sheet;
          for (const index of key.slice(1)) value = value.cssRules[index];
          return value;
        };
        if (kind === "rules") {
          const descending = (a, b) => {
            for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return b[i] - a[i];
            return b.length - a.length;
          };
          for (const key of [...keys].sort(descending)) container(key.slice(0, -1)).deleteRule(key.at(-1));
        } else for (const key of keys) container(key.slice(0, -1)).style.removeProperty(key.at(-1));
        for (const style of styles) style.textContent = [...style.sheet.cssRules].map(rule => rule.cssText).join("\n");
      }
      return "<!doctype html>\n" + document.documentElement.outerHTML + "\n";
    }, { kind, keys });
  }
  for (const kind of ["nodes", "rules", "properties"]) {
    let granularity = 2;
    while (true) {
      const keys = await keysFor(kind);
      if (!keys.length) break;
      const size = Math.ceil(keys.length / granularity);
      let reduced = false;
      for (let index = 0; index < keys.length; index += size) {
        const proposed = await candidate(kind, keys.slice(index, index + size));
        if (Buffer.byteLength(proposed) >= Buffer.byteLength(current)) continue;
        if (checks >= maxChecks || performance.now() - started >= maxDurationMs) { budgetLimited = true; break; }
        checks++;
        if (await interesting(proposed)) {
          current = proposed; granularity = Math.max(2, granularity - 1); reduced = true;
          progress.push({ phase: kind, check: checks, bytes: Buffer.byteLength(current) });
          break;
        }
      }
      if (budgetLimited) break;
      if (!reduced) {
        if (granularity >= keys.length) break;
        granularity = Math.min(keys.length, granularity * 2);
      }
    }
    if (budgetLimited) break;
  }
  return { html: current, checks, budgetLimited, progress };
}
