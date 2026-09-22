# Historical cases: when a reduced handoff helps

These are known-answer public-source reconstructions run locally on 2026-09-21,
not independent users or blind agent trials. The product is the released
0.1.0-alpha.1 revision `6763e7af16573a0868487cf95553d36728739081`.
Browser: Chromium 149.0.7827.55, Windows, Node 24.19.0.

Update 2026-09-22: the later [viewport audit](bootstrap-cases.md) found that the
original 892-byte baseline file changed mobile zoom while passing the old fields.
A distinct 892-byte rerun now passes the stronger viewport contract; the original
product file also passes that independent audit. The older measurements below
remain a record of their original contract, not retroactive version-2 evidence.

## A complete article with a real table-overflow fix

[simple.css PR 78](https://github.com/kevquirk/simple.css/pull/78) fixes a table
that makes the document overflow. We recovered the original article from its
author's public source after the original host's TLS certificate expired.
Certificate validation was not bypassed.

- Article: `content/posts/randomness.md` in `splch/blog` at
  `c8dcdc45e70d654c4399b7b2a8e41ca0b8ee3aa0`.
- Original theme: `splch/hugo-simplecss` at
  `3baee7d7cb19bf7b5ae367a6722d93a0371eaa24`.
- Its CSS gitlink exactly matches before revision
  `be95124c41bb5e613d72c3a7f8654ae69571a0ea`.
- Fixed editable CSS: `92ec2cb69c4f03008b877ee66351615fecbd2e8e`.

The complete selected article, original configuration/theme and referenced images
were built with checksum-verified Hugo 0.96.0. The historical workflow used
`latest`, so its exact generator is unknown. This is not a byte-identical archived
HTTP response. Unrelated posts were omitted; the inspected single-page template
does not depend on them. Article code snippets were not executed.

At 375 × 667 CSS pixels, mobile/touch, DPR 1, light scheme, the unique `table`
has width 460.046875 and makes the document 479 pixels wide. The fixed CSS gives a
375-pixel document and rejects that selected failure. Original minified and
editable before CSS agree. The PR did not update its minified stylesheet: the
controlled comparison serves editable before/fixed CSS at the original CSS URL.

| Workflow | Captured bytes | Accepted standalone bytes | Oracle checks |
| --- | ---: | ---: | ---: |
| Breakcase | 209,133 | 1,760 | 131 |
| SingleFile + Lithium, refined line phase | 166,268 | 1,632 | 91 |
| Same baseline, line + character phases | 166,268 | 892 | 500 total |

Both final files preserved target text and the documented geometry witness when
reopened offline after source shutdown. Breakcase left the caller page, scroll
and source files unchanged. Screenshots were inspected; appearance and scaling
can change despite matching the witness. Neither file establishes full visual,
application or root-cause equivalence.

The baseline uses SingleFile CLI 2.15.2 and Lithium
`8b567a5f7572240fc15d25ad0df173f2008010a3`, with the same witness and a shared
500-check / 30-second reduction cap. It retained its best accepted file at the
check cap. Its initial line-only attempt retained 42,426 bytes because head
metadata, an embedded icon and style content shared a line. We improved formatting
rather than using that avoidable artifact to claim a win.

A second baseline attempt failed independent reopening: repeated `setContent`
calls had retained mobile viewport state after a candidate removed viewport
metadata. The final baseline navigates to each candidate file before checking.
That unsuccessful attempt is retained and excluded from accepted results. It was
our harness error, not an identified Lithium defect.

**The competent baseline produced the smaller file.** Breakcase's hypothesis is
that a ready-made capture/witness/reducer/check workflow is useful. This case does
not prove that the convenience outweighs setup and reasoning costs. Direct
inspection of the styles and upstream fix was sufficient for the repair question;
reduction serves the separate need to hand off an offline failure.

## Two cases where reduction should be skipped

| Public case | Observed result | Decision |
| --- | --- | --- |
| [Bulma 3854](https://github.com/jgthms/bulma/issues/3854) | Button exceeds its parent by 48.546875 pixels; document and viewport are both 500 pixels. | `no-overflow`; use parent-relative inspection. |
| [MVP.css PR 3](https://github.com/andybrewer/mvp/pull/3) | At 320 pixels, the table's effective right is clipped at 320; the document's separate 8-pixel excess does not establish selected failure. | `no-overflow`; do not manufacture a positive by removing clipping or changing the input. |

Bulma uses the reporter's original HTML and pinned 1.0.1 stylesheet revision
`43b879db25d86d630e3e5c6282421b696b31ce33`. Its original quirks mode is retained.
An authored wrapping control removes parent bleed; it is not an upstream fix.

MVP.css uses its complete original static homepage and assets at
`75db7b6563c323c0506bf3be4e2a3a35205e9e1f`, with CSS fixed at
`3dbc7742bd224c94d74aa33a54145bc79679435a`. The fix makes the table internally
scrollable. The original report involved an iPhone SE; current Chromium emulation
does not reproduce or validate that physical Safari environment.

`no-overflow` means that the selected supported predicate is absent. It does not
mean the page has no layout problems. At this initial checkpoint two more positive
cases were still required; the [Bootstrap follow-up](bootstrap-cases.md) records
those inputs with explicit reconstruction and shared-source limits. These two
negatives do not count as positive defects.

## Evidence boundary

[Recorded measurements and source hashes](evidence/historical-cases-2026-09-21.json)
include the accepted and failed baseline outcomes. This report publishes the
measurements and source provenance, not the full private research workspace or
copied third-party article. It is not a standalone benchmark runner.

Source recovery, installation, helper development and reasoning were not timed
comprehensively. Breakcase's 1,827 ms in-process operation excludes browser startup;
the final baseline's 9,704 ms capture includes startup/waits, followed by 53 ms
formatting/validation and 16,964 ms reduction. These unequal scopes do not yield
a whole-task speedup. Independent choice, repeat use and net task benefit remain
unmeasured. No runtime change or broader product promise follows from these cases.
