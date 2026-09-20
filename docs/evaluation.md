# Preview evidence

The first product decision followed four local preflights on 2026-09-21. They
were exploratory, authored/known-case work, not blind or autonomous-agent trials.

| Check | Result and product implication |
| --- | --- |
| Refract responsive scan on four authored cases at two widths | 8/8 global overflow findings agreed with DOM measurements. Another generic scanner was not selected. |
| Static reduction, same oracle | Lithium: 377 bytes; Lab prototype: 628 bytes, from 10,612. No algorithm advantage shown. |
| Actual Intake UI, live edits and external stylesheet | SingleFile and Lab capture preserved selected state/geometry after the original service stopped. Raw HTML did not. No generic-archiver advantage shown. |
| Historical Proofline renderer, authored long contract field | Both complete paths preserved the selected failure on fresh offline reopening; current renderer was the healthy control. SingleFile + Lithium: 1,743 bytes; Lab prototype: 1,875, from a 25,953-byte report. |

Pinned baselines: Refract `61d470a7c1a3cbd986b4cf2d033316dfa09f05c4`,
Lithium `8b567a5f7572240fc15d25ad0df173f2008010a3`, SingleFile CLI 2.15.2.
The research browser was Chromium 149.0.7827.55 on Windows/Node 24.19.0.
Installed-tool runtime did not include research, installation and custom harness
authoring. It cannot support a whole-task time/token benefit claim.

One capture attempt initially compared viewport X after a UI scroll with X in a
fresh unscrolled file. This was our harness error. It was corrected to document
coordinates without relaxing tolerances; the original attempt was retained.

The product adds a reusable built-in predicate and complete Page/CLI path. Its
predicate also preserves height/text-width and accounts for clipping; therefore
preflight byte counts are not advertised as current package benchmark results.
Fresh package tests exercise the actual product independently.

## Product checks

`pnpm test` covers complete capture/reduction/reopen, changed-file rejection,
caller page preservation, refusal to overwrite, healthy/hidden/contained-scroll
negatives, target ambiguity, incomplete capture, bounded reduction, external
CSS/images and current form values after server shutdown, and the historical
renderer/fixed-renderer pair. `pnpm smoke <tarball>` installs the packed artifact
into a new directory and runs its demo, check and refusal-to-overwrite behavior.

Local first run: 6 browser test groups passed on Windows with Node 24.19.0 and
Chromium 149.0.7827.55. Hosted CI and publication status are recorded in the release
notes when actually observed. Passing automated checks does not establish physical
device validation or external adoption.

## What remains unknown

- Independent agent choice and repeat use.
- Setup plus capture plus reasoning cost versus a reusable SingleFile/Lithium helper.
- Whether a small case actually helps repair a particular bug or its maintainer.
- Robustness across applications, fonts, browser versions and unsupported features.

Byte reduction is an implementation observation, not saved context tokens or time.
If direct measurement/fixing or a short existing-tool helper is preferable, that
is a useful negative result. Do not expand to a general debugger on this evidence.
