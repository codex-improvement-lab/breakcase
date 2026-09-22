# Bootstrap cases and the alpha.2 contract

The Pagination case exposed a concrete alpha.1 limit: a stylesheet applied
successfully but its cross-origin CSSOM was unreadable. Alpha.1 returned
`capture-incomplete`. The same resource permits an ordinary CORS fetch; alpha.2
uses that path and verifies the saved file. It does not bypass CORS/CSP or send
cross-origin credentials.

Visual inspection then found a second problem in the old comparison: a reducer
could remove mobile viewport metadata, retain the recorded layout dimensions and
let the browser zoom out. Witness version 2 also records visual viewport width
and scale. Legacy records remain explicitly identified by `check` as lacking
that comparison.

## Sources and limits

[Bootstrap issue 24877](https://github.com/twbs/bootstrap/issues/24877) records
documentation overflow at 375 CSS pixels using Chrome iPhone 6 emulation.
[PR 24878](https://github.com/twbs/bootstrap/pull/24878), commit
`05d88ca285100e57220bdb7079a3bcbd13da87d3`, adds `overflow: auto` to `.bd-example`.
This contains the documentation example; it does not repair the component's
intrinsic responsiveness. The maintainer distinguishes those goals.

The complete published pages and first-party assets come from `gh-pages` revision
`ed05e78a9b9a02d47d8e614a2761561028c63aca` (2017-10-19), older than the report.
The fixed control applies the upstream addition to the archived compiled rule.
This is not a post-fix deployment download or exact reporter-checkout replay.
The radio and pagination markup match the before-fix source after HTML
normalization. The archived checkbox variant lacks a class added later in main;
its original markup/CSS are kept together, without inserting that class.

The current major-2 DocSearch CSS is pinned by hash and retains its cross-origin
URL. Its exact 2017 version is unknown. The live response was checked for matching
bytes and `Access-Control-Allow-Origin: *`. Ads, analytics and remote search
scripts were blocked; first-party scripts and the local jQuery fallback remained.
An expected `docsearch is not defined` error limits application-behavior claims.
There is no full-site interaction or physical iPhone acceptance claim.

## Stronger-witness results

Profile: 375 × 667, mobile/touch, DPR 1, light scheme, Chromium 149.0.7827.55.
Both sources have visual viewport width 375 and scale 1.

| Case | Before document width | Fixed width | Breakcase standalone bytes | SingleFile + Lithium bytes |
| --- | ---: | ---: | ---: | ---: |
| B-P03: large pagination | 410 | 375 | 5,005 | 1,081 |
| B-P05: checkbox button group | 439 | 375 | 5,314 | 1,017 |

Both product files and baseline files pass fresh offline reopening after source
shutdown, preserving selected text/geometry and the visual viewport/scale. Each
product capture uses one CORS stylesheet fallback. Source pages are unchanged.
The baseline is smaller on both cases; no algorithm advantage is claimed.

SingleFile CLI 2.15.2 and Lithium
`8b567a5f7572240fc15d25ad0df173f2008010a3` use competent line formatting, a
file-navigation oracle and line/character phases sharing 500 checks / 30 seconds.
Both baseline runs reach the check cap and retain the best accepted file.

The first baseline files were 1,065 / 1,001 bytes but had visual widths 409 / 439
and scales about 0.917 / 0.854. Those files satisfy the earlier numerical contract,
not version 2, and are retained as superseded comparisons. Both arms were rerun
with the same strengthened predicate, source, selector, profile and budgets.

The initial B-P04 radio group reached only 348 pixels. Its page was wider because
of a different element. That `no-overflow` result is retained, not counted as a
positive. B-P05 was frozen separately after the observation; selection was
exploratory, not blind.

The previous simple.css baseline was audited too: its old 892-byte file changed
visual scale to about 0.783. A new version-2 baseline is also 892 bytes but has a
different hash and retains visual width 375 / scale 1. The alpha.1 product file
(1,760 bytes) independently passes the stronger observation. Do not substitute
the old file merely because its byte count happens to equal the new one.

These are **three accepted inputs from two independent projects and two report/
fix families**. The two Bootstrap inputs share one report and containment
mechanism. Two earlier skip negatives remain recorded. This does not establish
general frontend coverage, independent adoption or repeat use.

## Cost and interpretation

The first product operations took 4,312 / 5,064 ms on already-open source pages.
The final baseline captures took 11,155 / 11,496 ms including startup/waits;
their reduction took 16,474 / 18,510 ms. These scopes differ. Restoration,
dependency setup, helper authoring and reasoning are not fully timed, so these
figures do not measure whole-task speedup or context savings.

Views were inspected, and the zoom discrepancy changed the actual contract and
comparison. Even the stronger witness does not preserve every visual detail,
interaction, accessibility behavior or original root cause. Direct inspection of
the known CSS fix is sufficient when no offline handoff artifact is needed.

[Measurements](evidence/bootstrap-cases-2026-09-22.json) retain the first refusal,
wrong-target result, viewport audit and corrected comparisons. The source assets
and research helpers are not a standalone benchmark distribution here.
