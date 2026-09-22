# Changelog

## 0.1.0-alpha.2

- Preserve the visual viewport width and zoom in witness version 2. File checks
  reject mobile auto-zoom changes that previously passed the layout-only fields;
  legacy records remain explicitly identified as using the earlier comparison.

- Capture linked UTF-8 CSS when CSSOM access is unavailable but an ordinary
  browser CORS fetch is permitted. Preserve redirected resource bases and the
  existing no-cross-origin-credentials behavior; denied and oversized stylesheets
  remain explicit failures. Record the successful fallback count in JSON.
- Include the linked historical-case documentation and measurements in the package.

- Document a public historical article handoff and two skip-reduction cases,
  including the smaller competent baseline and retained unsuccessful attempts.
  The earlier 0.1.0-alpha.1 release and assets remain unchanged.

## 0.1.0-alpha.1

- Original static capture and structural DOM/CSS reduction for a selected
  right-side document overflow, with a built-in layout witness.
- Existing Playwright Page API, CLI, explicit viewport/mobile mode and click setup.
- Fresh offline reopening, saved-file check, compact JSON and local visual report.
- Preserve the caller's page and existing output directories; bounded reduction
  retains its best accepted result. Unsupported/lost state is explicit.
- Authored demo, healthy/intentional-scroll controls, live form/resource capture
  and a historical internal Proofline renderer regression with its fixed control.

Experimental: no claim of agent preference, time/token savings, general archiving,
whole-application equivalence, exact root cause or globally minimal output.
