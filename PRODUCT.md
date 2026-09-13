# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Right now, exactly one person: a solo, non-technical operator running an
influencer-marketing agency, using their own Google account. They are the
builder's only user today. ROADMAP.md records real ambition toward a
multi-client/agency-team product later (a Google Workspace Add-on
conversion, "properly multi-document/multi-client installable"), but that
is a future direction, not current reality -- do not design as if a second
user or a permissions model exists yet.

## Product Purpose

Koli runs an influencer-marketing agency's creator discovery, vetting, and
outreach loop entirely inside a Google Sheet: find creators, vet them
(niche fit, engagement authenticity, sponsor history, brand safety), track
outreach through a real pipeline, and export pitch-ready documents --
without leaving the spreadsheet. Success, in the operator's own words right
now, means **faster and cheaper creator vetting**: less time and money
spent researching and qualifying a creator before outreach even starts.
Pipeline/deal-closing throughput and cost-avoidance-vs-paid-tools both
matter, but vetting speed/cost is the metric to optimize for when priorities
compete.

## Positioning

Two things a competing product (Airtable, Sponsorship.so, TalentSheets,
GRIN, CreatorIQ) can't truthfully copy without becoming a different
product:

- **Zero context switch**: every feature lives inside the Google Sheet the
  operator already works in all day -- no new app, no data migration, no
  second login. The literal spreadsheet grid is itself a real, always-
  available fallback UI, not just Koli's backing store.
- **Zero/near-zero cost by construction**: built on free-tier YouTube Data
  API, Gemini, and keyless integrations (SponsorBlock, old.reddit.com,
  Google's public DNS-over-HTTPS resolver), not a per-seat SaaS subscription.
  This is a deliberate, ongoing constraint on every new feature, not a
  launch-phase compromise.

Koli is explicitly agency-side today, not brand-side: per ROADMAP.md's own
founder assessment, "Koli doesn't yet have what it takes for a BRAND (not
an agency) to choose it directly" -- Publish-as-Page and Brand View exist to
put a safe, read-only surface in front of a brand, not to make Koli a
brand's own tool.

## Operating Context

One end-to-end loop, all inside one Google Sheet plus a companion browser
extension:

1. **Discover** a creator (paste a link, or find similar ones from a seed).
2. **Vet** them: niche, posting cadence, engagement authenticity, sponsor
   history, brand safety, a composite Grade, and (against a specific brand
   brief) a separate Brand Fit Score.
3. **Track outreach** through a real pipeline (status dropdown or a
   drag-and-drop Kanban board), with Notes/Last Contact/Documents on the
   record.
4. **Close and manage the deal** (Campaigns: stage, deliverables, value,
   deadline, documents).
5. **Export** pitch-ready documents (Creator One-Pager, Draft Deal Memo,
   Shortlist Report, Performance Report) when a deal needs a real
   deliverable outside the sheet.

The "Send to Koli" browser extension exists because step 1 usually starts
on YouTube itself, not inside the spreadsheet: right-click a video/channel
anywhere in the browser to send it in.

## Capabilities and Constraints

- **Free tier**: Channel/Video/Profile analysis, Discover, Sponsors,
  Attention (the stale-follow-up/opportunity surface), Brand Targets.
- **Premium tier** (soft local access-code check today, explicitly not real
  DRM yet -- see licenseService.gs): Gap Analysis, Brand Fit Score, Draft
  Outreach Email, every Export, Campaigns (sheet and Kanban), Brand/Profile
  View, the expanded record modal, Documents (upload+OCR and Drive-link).
- **Constrained by the platform, on purpose**: Apps Script has no raw-socket
  API (no real SMTP verification for guessed emails -- pattern-guess +
  DNS-health check only, explicitly labeled unverified), and the Drive OAuth
  scope is deliberately kept to `drive.file` (not full `drive`), which ruled
  out an arbitrary Drive-file-picker for years until the Google Picker
  API's per-file-grant mechanism solved it within that same narrow scope.
- **Verification gap, stated plainly**: this project is built without a
  live Google account in the dev environment. Every feature is built to
  documented API behavior, but "documented" and "confirmed against a live
  response" are different claims -- STATUS.md's "What's verified vs. what
  isn't" section is the current, authoritative list of which is which.
- **Estimates are labeled as estimates**: CPM ranges, audience
  location/age/gender, and Grade's evidence-coverage bands
  ("graded"/"provisional"/"insufficient evidence") all exist specifically so
  a computed-but-uncertain number is never presented with false confidence.

## Brand Commitments

- Name: **Koli**. **Visual identity replaced 2026-09-13** (explicit founder
  decision: full adoption, not a craft-level-only pass) to match
  [impeccable.style](https://impeccable.style/)'s own design system rather
  than Koli's prior green/teal identity. Typeface: **Albert Sans** (was
  Inter) across Sidebar and dialogs; Sheet cells still use Abel (a Sheets
  cell can't load a web font anyway). Palette: an oklch-based neutral "paper"
  system (near-black ink, a single ~46%-gray muted-text tone, hairline
  8%-alpha rules) with a warm "kinpaku" gold family as the secondary/tag
  accent and a cooler "patina" teal-gray family carrying the primary
  interactive-accent role (links, active tab, focus), "vermilion" for
  errors -- exact oklch values read directly off the live site's CSS custom
  properties, not approximated. Every existing CSS variable name in each
  surface (`--green`, `--krm-green-700`, `--ink-900`, etc.) keeps its old
  semantic role; only the underlying values changed, file by file, so this
  is a re-tokenization, not a rebuild of each surface's markup.
  **Rollout status**: Sidebar.html done and confirmed in this session's own
  browser preview (Apps Script sidebar itself not yet live-tested by the
  user); the record modal, both Kanban boards, dialogs, and the browser
  extension are being brought to the same tokens next -- check NOTES.md's
  latest addendum for exactly which files are done as of any given read.
- **"Enterprise grade" is something a user discovers, not something Koli
  claims.** Explicit founder directive (ROADMAP.md, round 16): never state
  or imply enterprise-grade quality in copy; the experience itself should
  lead someone to that conclusion partway through using it.
- Never overstate what a document or number actually is: the Draft Deal
  Memo is labeled DRAFT / NOT LEGAL ADVICE rather than implying it was
  lawyer-drafted; a pattern-guessed email is labeled "pattern-guessed, not
  verified," never presented as confirmed.

## Evidence on Hand

- A working Chrome Web Store submission package exists
  (`send-to-koli-extension/koli-webstore-submission-package.zip`) with 5 real
  product screenshots (`send-to-koli-extension/store-screenshots/`).
- The product's only real-world usage evidence today is the founder's own
  daily use while building it (bugs found and fixed this way are logged in
  STATUS.md's changelog). No external customer testimonials, case studies,
  or press exist yet -- do not fabricate or imply any.

## Product Principles

1. **Never leave the Sheet.** Every feature works inside the spreadsheet the
   operator already lives in; a new capability that requires a separate app
   or a data migration is the wrong shape for Koli.
2. **Zero/near-zero cost by construction.** Free-tier APIs and BYOK are a
   standing design constraint, not a launch-phase compromise to grow out of.
3. **Honest about confidence.** An estimate is labeled an estimate; a
   computed field with weak underlying evidence says so (evidence-coverage
   bands) rather than presenting a clean number with hidden uncertainty.
4. **Enterprise-grade is discovered, not claimed.** No feature or copy
   asserts polish or credibility on its own behalf.
5. **Built for one fast-moving, non-technical operator.** Workflows optimize
   for a solo user vetting creators quickly today; role-based permissions,
   team seats, and multi-user conflict handling are explicitly not solved
   problems yet.

## Accessibility & Inclusion

No external accessibility requirement exists today (solo-operator internal
tool, decided 2026-09-13). Treated as a nice-to-have, fixed opportunistically
when found (e.g. real contrast/legibility issues get noted and triaged) --
not a hard gate that should slow down feature work. Revisit this section if
Koli ever gets a second real user or an external/brand-facing audience.
