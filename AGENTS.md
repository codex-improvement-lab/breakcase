# Breakcase

Build a small runnable HTML/CSS reproduction of an explicitly selected overflow.
The product is a new original Lab implementation; existing mature alternatives
are SingleFile plus Lithium. Do not claim better reduction, root cause, smallest
possible files, saved tokens/time or agent preference without actual evidence.

The initial product supports one static layout predicate, a CLI and an existing
Playwright Page API. Preserve source files and the caller's browser/session.
Reject missing/ambiguous targets, absent overflow and captures that lose the
selected state. Bound reduction work and retain the best accepted file. Capture
is not an application replay or a security sanitization guarantee. No upload,
telemetry, browser-profile discovery, generated LLM requests or account changes.

This child is an independent Git repository. Run commands here. Preserve edits
made by other agents/users and sibling repository work. Use pnpm and the pinned
dependency lock. Set PLAYWRIGHT_SKIP_BROWSER_GC=1 when installing test browsers;
do not garbage-collect another project's browser installation.

Tests must exercise supported browser behavior and meaningful negative cases.
Document local/CI/platform evidence accurately. The Lab owner has user authority
to publish a tested preview and relevant promotion. Old Lab tags stay unchanged.
