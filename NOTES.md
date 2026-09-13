# Koli: Handoff Notes

*Written for context-window handoff (write → /clear → resume). Supersedes
nothing in STATUS.md/ROADMAP.md, which are the durable project docs —
this is the "what was I doing right before the clear" layer.*

## Where things stand right now

- **Web App deployment**: `AKfycbxdF7_YeyVq_LICSGbYLwQQvI-K6f22uX3rjLn2_CpAGENR5bIuuRSATB_1Y0sF5E-u`,
  currently at **version 18**. Apps Script HEAD (via `clasp push`) is always
  current; the deployed Web App version is what the extension and any
  published pages actually hit, and needs its own `clasp deploy -i` after
  any change that touches `doGet`/`doPost`/anything reachable from them.
- **The permanent quirk, still true**: every `clasp deploy -i` on this
  project resets the Web App's "Who has access" back to requiring
  sign-in, regardless of what the manifest says. After *every* deploy,
  the user must manually: Apps Script editor → Deploy → Manage
  deployments → edit → confirm "Anyone" → Deploy. This has bitten every
  single feature test this session at least once.
- **clasp is local, not global**: installed in `node_modules/` (not on
  PATH). Use `./node_modules/.bin/clasp` (bash) or
  `.\node_modules\.bin\clasp.ps1` (PowerShell), not a bare `clasp` command.
- **Git**: repo is on GitHub at `github.com/Sadim/Koli` (private, added
  as `origin`). Codeberg/GitLab/Radicle were requested but not started —
  no `glab`/`tea`/`rad` CLI available in this environment; GitHub only
  worked because the user ran the push themselves in their own terminal
  (my own `git push` attempts are blocked outright by a tool-permission
  classifier, confirmed twice, not a credentials problem).
- **User preference on file, from memory**: user is a non-technical
  novice — default to doing setup/execution myself rather than handing
  them manual steps; only ask them to act for genuine hard blockers
  (OAuth screens, billing, my own tool-permission limits).
- **Security note, unresolved**: early in the GitHub setup, the user
  pasted a real fine-grained GitHub PAT directly into this conversation.
  I recommended revoking it before generating a replacement — **there is
  no confirmation it was ever actually revoked.** The push that ultimately
  succeeded went through Windows Credential Manager's own browser-based
  login, not that pasted token, so it was likely never used for anything
  — but if it's still live on github.com/settings/tokens, it should be
  revoked regardless. Worth checking/asking if this comes up again.

## Pending diffs — NOT yet committed or pushed to GitHub

GitHub is currently behind live Apps Script HEAD. Uncommitted as of this
write:
```
M STATUS.md              (feature inventory + architecture snapshot brought current -- was several features behind)
M constants.gs           (new SHEET_NAMES: PUBLISHED_PAGES, EMAIL_OPENS, BRAND_INTEREST; new PROP_KEYS)
M inboxService.gs        (doGet: track/express/p routing + debug=1 mode)
M publishService.gs      ("I'm Interested" button + logBrandInterest_)
M sheetWriter.gs         (Engagement % fix: format-based, not magnitude-based)
M uiHandlers.gs          (menu restructure into nested sub-submenus; Kanban menu item)
?? NOTES.md              (this file)
?? OutreachKanban.html   (new: Kanban board dialog)
?? kanbanService.gs      (new: Kanban board backend)
```
This list is a snapshot as of writing -- always trust a fresh `git
status` over this table if they ever disagree.
All of this **is** live on Apps Script (pushed via clasp) — it's only
missing from git/GitHub. Commit + push when next asked (git safety rule:
only commit when the user explicitly asks).

## Decisions made this session, with why (don't re-litigate without reason)

- **MCP for Sheets/Drive access**: recommended `--scope local`, not
  project — project scope writes to a committed `.mcp.json`, which would
  leak into the now-public-on-GitHub repo. User has not yet confirmed
  they actually ran the `claude mcp add` command or connected it.
- **Workspace Marketplace `addOns` manifest block: added, then reverted.**
  Google requires an explicit `urlFetchWhitelist` for any project
  declaring `addOns`, which is fundamentally incompatible with
  `contactService.gs`'s arbitrary-site contact discovery (fetches
  whatever URL is found in a channel description — unbounded, can't be
  whitelisted). Reverted rather than cripple a working feature for a
  publishing path the user hasn't committed to. `addOnHomepage.gs` (the
  CardService homepage card) is still in the codebase, harmless and
  unused until/unless `addOns` comes back. A background task
  (`task_c9b433c4`, may still be running/available) was spawned to scope
  a real fix for this conflict.
- **Public Marketplace listing vs. "multi-client installable" template
  copy: still an open decision**, not made by the user yet. ROADMAP.md
  records the *original* plan was template-copy first, public listing
  later, as a deliberate separate step.
- **Engagement % display bug**: root cause was Sheets silently
  auto-converting a `"3.9%"`-shaped string into a fraction (0.039) with
  native percent formatting on `setValue()` — every reader saw the raw
  fraction. Fixed by writing a plain number + explicit literal-suffix
  format (`0.0"%"`) going forward, and reading old vs. new rows apart by
  checking the cell's *actual number format*, not the value's magnitude
  (a real low-engagement channel could have a legitimately small number,
  so magnitude-based guessing would have been wrong).
- **Menu scroll-cutoff**: Google Sheets custom menus have no scrollbar
  and no API to add one. Fixed by nesting sub-submenus (Brand
  Intelligence → Discovery/Research; Export → Documents/Outreach/Views &
  Pages) instead of one more item-shuffle — this already broke once
  before from just moving one item.
- **Contact email guessing**: two-tier plan. Free tier (built): pattern
  generation + DNS-based domain health (MX/SPF/DMARC, Verdict-inspired,
  github.com/omm9846/verdict) — explicitly labeled "pattern-guessed, not
  verified" since Apps Script has no raw-socket API for real SMTP
  verification. Paid tier (not built): Apollo, Koli-fronted (user's
  explicit choice, "option b" — not BYOK), gated behind connecting Apollo
  via the user's claude.ai connector settings first.
- **Declined to build**: an "Aura"-inspired autonomous browser-action
  executor with randomized human-like timing ("Anti-Bot Safeguard"
  checkbox) that POSTs scraped page content to an unspecified cloud
  proxy. Assessed as detection-evasion tooling (the timing has no purpose
  except defeating bot detection) plus a privacy-policy contradiction
  (sends page data to a third party Koli's own policy says never
  happens). Told the user plainly why, offered a narrower legitimate
  alternative (page-aware assistance with no pacing tricks, no data
  leaving the browser) instead.
- **In-extension email client (user's suggestion) — recommended against,
  not built.** When scoping the CRM/task/transcription ask, the user
  floated replacing Gmail/MailApp with a real compose/send/receive email
  client built into the extension. Pushed back: that's a huge, ongoing
  surface (threading, IMAP/SMTP or Gmail API sync, deliverability, spam)
  that competes with Gmail rather than sitting next to it. Recommended
  instead: keep sending through Gmail/MailApp, build the CRM's UI as a
  layer *on top of* the existing email flow (pipeline stage, per-brand
  timeline, open tracking -- the last of which is now built). This
  wasn't revisited/re-confirmed after the pushback -- worth explicitly
  checking the user still agrees before any CRM UI work starts.
- **Lightweight browser-AI sidecar — a real, live idea, distinct from the
  rejected Aura-style agent.** Separately from the declined autonomous
  browser-action executor (see below), a narrower use was discussed
  positively and never invalidated: fast on-page pre-screening before
  spending a real Gemini call, and grammar/polish on outreach drafts --
  no page-data leaving the browser except to Koli's own Web App, no
  pacing/detection-evasion tricks. Not built, not rejected -- just still
  queued behind other work.
- **A referenced "Telegram image" was never actually shared.** The user
  mentioned "I'm referencing Telegram image shared on new feature for
  writing post" while discussing the CRM/email-client idea, but no image
  was ever attached to that or any later message. Flagged at the time
  that I didn't have it and asked them to resend if still relevant --
  they haven't yet. If this comes up again, it's still an open loop, not
  something already answered.
- **Twelve external repos evaluated this session for reuse** (worldmonitor,
  Aether/techjarves Local-Browser-AI, Kuali, Verdict, Magio, aura-live,
  then a second batch: Youtube_Subscriber_Tracker, Novu, Notifuse,
  influencer-sponsorship-api, Collabry, checkitout-backend): **verdict
  across all of them is "concepts only, no portable code"** — either
  wrong tech stack (Java/Spring/Postgres/Go/Docker vs. Apps Script),
  unclear/no license, or too immature. The one actually-adopted idea from
  each: Verdict → DNS-health check pattern (built); Magio → tracking
  pixel pattern (built); Collabry → "ranking cards with scoring
  rationale" validates the Grade/Brand Fit "i" reasoning-toggle idea
  (not yet built); checkitout-backend → best data-model/workflow
  reference for the still-queued formal data model, and independent
  confirmation Stripe is the right payment pick.
- **Two more evaluated outside that batch, from earlier in the project's
  life** (before this NOTES.md's own tracking window, so not in the count
  above): **Bytez** (a bundled-API-keys service) — decided not worth
  building against, Koli's own per-service BYOK approach was judged
  sufficient. **Derrick** (workspace.google.com Marketplace app +
  derrick-app.com, "LinkedIn Email/Phone Finder AI") — this is the one
  that actually **triggered** the whole Guess Contact Email feature:
  investigating how Derrick works confirmed it queries an aggregated
  third-party contact database via a LinkedIn URL as a lookup key, not
  live LinkedIn scraping — a materially different, legally cleaner
  mechanism than what was flagged as risky earlier, and the direct reason
  the free pattern-guesser + planned Apollo tier were built the way they
  were.

## Two features still not confirmed end-to-end (predate this session, but directly relevant to what got built on top of them)

- **Send Approved Drafts (real email sending)**: built earlier in the
  project's life, but a real send has never been confirmed by the user
  end-to-end. This session added the open-tracking pixel *on top of* that
  send path — if the base send itself has never actually fired
  successfully, the tracking pixel is equally unconfirmed by extension,
  not just untested on its own.
- **Creator Shortlist Report**: this was the feature originally blocked
  by the `getActiveRangeList()` permission bug (same root cause as Brand
  Fit Score, which *was* confirmed fixed via a real test). The fix should
  apply equally to Shortlist Report since it shares the same
  row-selection code path, but the user never specifically re-ran
  Shortlist Report itself to confirm — don't assume it's fixed just
  because Brand Fit Score was.

## Remaining steps / open threads, roughly in the order they came up

1. **Debug the "This page is no longer available" bug** — user hit this
   testing a published page; `?debug=1` mode was just added and deployed
   (v18) to show the real failure reason instead of the generic message.
   Waiting on the user to retry with `&debug=1` appended and report back
   what it says. Don't re-guess the cause blind again if this comes up —
   the debug output should say definitively.
2. **Automatic interval-based channel tracking** — proposed (Apps
   Script time-driven trigger wrapping the same logic "Refresh Tracked
   Profiles" already runs), not yet built. Needs the user's go-ahead and
   a decision on interval (suggested 6-12h to manage YouTube quota, not
   hourly).
3. **Port the Sidebar's sparkline/trend-history treatment to the
   extension's Pull Stats card.** Confirmed and queued, not built: user
   said "This works on Google sheet and I love it that's why I want it on
   the extension," referring to the Sidebar channel card's Views/Likes/
   Comments trend charts. Real caveat already flagged to the user: only
   meaningful for channels with tracking history already built up (a
   fresh, never-before-seen channel has nothing to chart yet, same as the
   Sidebar today).
4. **Follow up on the stable/unstable feature list.** User explicitly
   said "I'll get back to you on these (remind me)" in response to the
   stable-vs-not-stable inventory given earlier this session. That
   inventory is reproduced in STATUS.md's "What's verified vs. what
   isn't" section (pre-existing) plus this session's additions above --
   if the user hasn't raised it again, it's still an open loop to
   surface, not something already resolved.
5. **Brand + Campaign workflow UI, polished start-to-finish** — user's
   explicit preference is build-and-fix over mockups first. Not started.
   Candidate next real UI project after Kanban (which is done).
6. **The "crucial four" from an earlier ask**: CRM (extension-based,
   own UI, explicitly "snappy," lighter version on Sheets too — not
   started as a distinct feature, though open-tracking + Brand Interest
   sheet are steps toward it; see the email-client pushback above before
   starting this), Mailtrack-equivalent (done, pixel-based),
   Transcription (extension-side, for both sales and brand calls, report
   lands in Sheets — not started), per-brand task execution (checklist
   per campaign: contract → assets → posted → invoiced was the working
   idea — not started, needs real UI).
7. **Formal data model** (Person/Opportunity/Conversation/Outcome as
   real objects) — still "very important," not started. Cross-check
   against the 32-section vision PDF's own data-model spec (see above)
   before designing from scratch; use checkitout-backend's entity design
   as a secondary reference point, not a template to copy.
8. **promptfoo A/B testing harness** — agreed early in the session,
   never started.
9. **Stripe payment-link/invoice integration** for closed deals —
   recommended over Payment Links/Checkout/PayPal, not built.
10. **Pill-shaped type labels** — user never actually answered where to
    put them first (Sidebar card? extension log? report outputs?). Still
    open.
11. **Kanban negotiation/counter-offer detail view** — a possible
    follow-on to the Kanban board (click a card → see offer history),
    inspired by Collabry, not committed to or scoped yet.
12. **Chrome Web Store submission**: package is ready
    (`send-to-koli-extension/koli-webstore-submission-package.zip`), but
    actually clicking submit + paying the one-time $5 fee is the
    account holder's step, not done.
13. **Workspace Marketplace**: package ready
    (`koli-workspace-marketplace-package.zip`), but blocked on (a) the
    public-vs-multi-client decision above, (b) the urlFetchWhitelist
    conflict, (c) a demo video only the user can record, (d) 2 of the 4
    screenshots needing a live browser session to capture.
14. **Git**: only GitHub is live. Codeberg/GitLab/Radicle still wanted,
    not started — will need equivalent CLI tools or manual repo creation
    + the user running the first authenticated push themselves, same
    pattern as GitHub. `.gitignore` now excludes `node_modules/` (267MB,
    added this session when clasp was installed locally) — if it
    reappears untracked in a future `git status`, that's expected, not a
    regression.

## Other files in the repo worth knowing about (not audited/updated this session)

- **`.artifacts/koli-presentation.html`**: a one-off pitch-deck-style
  artifact built for external use (a presentation *about* Koli), not part
  of Koli's actual product. Built during an earlier, unrelated task in
  this project's life (a pptxgenjs/Node non-ASCII text-corruption bug was
  fixed while making it, if that ever looks relevant — the fix was "use
  only ASCII punctuation," nothing about Koli's own codebase). Safe to
  ignore for anything related to Koli's actual features.

- **`EULA_DATA_SHARING_CLAUSE.md`**: a draft legal clause for an
  opt-in data-pooling feature (aggregate sponsor-detection data shared
  across customers) -- this describes a **future, unbuilt** feature, not
  current behavior. Koli does not pool or share any customer's data
  today. Don't confuse this with the actual privacy policies (extension's
  and Koli's own, both live at hosted URLs -- see ROADMAP.md/STATUS.md).
- **`OPERATOR_GUIDE.md` / `USER_MANUAL.md`**: exist in the repo, were
  never opened or verified this session. Likely stale against everything
  built recently (same risk as README.md's file table, confirmed stale).
  Treat as unverified until someone actually reads them against current
  behavior.
- **The 32-section "Koli_100_Percent_Thread_Faithful_Master_Handoff" PDF**
  (read early in this session, from a separate/parallel AI conversation
  about Koli): a full product-vision document -- Brand Discovery Flow,
  confidence hierarchies, a formal data model, a 14-step build order,
  Red Team/Blue Team analysis. It was **read for context, not
  systematically implemented against** -- Brand Discovery got built
  independently and happens to satisfy its top-priority ask, but the
  rest of the document (the formal data model spec especially) hasn't
  been cross-checked against what actually got built. Worth a real
  comparison pass before assuming the "formal data model" work (still
  queued) starts from scratch rather than from that document's spec.

## One honest limit on this document

Everything above was checked against this session's own actions and this
conversation's history. STATUS.md's sections that pre-date this session
(Discovery & vetting, Sponsor intelligence, Outreach, most of Cross-
cutting) were **not** independently re-verified against current code in
this pass — they're carried forward as previously-recorded fact, not
re-confirmed. If something in one of those older sections turns out to
be stale, that's a gap in this pass, not a new problem.

## If resuming into a fresh context

Read this file, then STATUS.md (living "what exists" doc) and
ROADMAP.md (the "what's next and why," including the publishing
checklist) for full background before touching anything. Check `git
status` and the deployment version against what's recorded here — both
may have moved if the user did something in between sessions.
