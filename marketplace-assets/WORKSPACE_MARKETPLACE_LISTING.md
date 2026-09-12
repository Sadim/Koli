# Google Workspace Marketplace: Listing Copy & Submission Notes

Draft copy, ready to paste into the Marketplace SDK listing form once the
Cloud Console side (below) is set up. Same "starting point, not final
marketing" framing as the Chrome Web Store copy.

## Before this listing can go live: a note on sequencing

Koli's own `ROADMAP.md` records an earlier, deliberate decision: **the
Workspace Add-on conversion was scoped as "properly multi-document/multi-
client installable," explicitly *not* a public Marketplace listing** ("that's
a separate, later, discrete step"). Today's work built everything needed for
*either* path — the `addOns` manifest block, the CardService homepage card,
the icon, and these listing materials all apply whether you publish
privately/unlisted or go fully public. But actually flipping this listing to
public triggers the OAuth verification process below, which was the part
originally deferred. Worth deciding explicitly before submitting rather than
by default.

## App name
Koli

## Short description (~80 characters)
Influencer-marketing research, vetting, and outreach — right in Sheets.

## Detailed description

Koli turns a Google Sheet into a working influencer-marketing agency
toolkit: find and vet YouTube creators, track sponsor activity, score brand
fit against a real campaign brief, and draft outreach — without ever leaving
the spreadsheet.

**What it does:**
- Analyze any YouTube channel or video: niche, posting cadence, engagement
  authenticity, audience estimate, contact info (including the About page's
  own link section, not just the description box)
- Track sponsor mentions automatically, cross-checked against the free
  SponsorBlock database before falling back to AI inference
- Score a channel against a specific campaign brief (target niche, audience,
  budget) — a different question than a channel's general quality Grade
- Draft a personalized cold-outreach email hooked on a specific detail from
  a creator's recent videos, editable before it's ever sent
- Export pitch-ready documents: a Creator One-Pager, a Deal Memo, a
  Shortlist Report for a client, a Performance Report
- "Attention" view: what actually needs you today (stale follow-ups, new
  sponsor activity, high-grade channels with no sponsor history yet) instead
  of another table to skim

**Bring your own keys.** Koli requires your own YouTube Data API key and
your own AI provider key (Gemini, Mistral, or Groq) — entered once in
Settings. There's no subscription to the developer's own infrastructure for
the core analysis: you control your own usage and cost with those
providers directly.

**Your data stays yours.** Koli runs as Apps Script attached to your own
spreadsheet. There is no backend server operated by the developer: nothing
you analyze, draft, or export passes through or is retained anywhere but
your own Google account. See the Privacy Policy for full detail.

## Category
Productivity

## OAuth scope justifications (for the verification form)

**`https://www.googleapis.com/auth/spreadsheets.currentonly`**: Read and
write the single spreadsheet Koli is attached to. Never requests access to
any other spreadsheet in the user's Drive.

**`https://www.googleapis.com/auth/script.container.ui`**: Show Koli's
custom menu, sidebar, and dialogs inside the Google Sheets UI — the entire
interface.

**`https://www.googleapis.com/auth/script.external_request`**: Call the
YouTube Data API and the user's chosen AI provider (Gemini/Mistral/Groq)
using API keys the user supplies themselves in Settings. Also used for
SponsorBlock and Reddit, both public unauthenticated endpoints, for
sponsor-detection and brand-safety signals.

**`https://www.googleapis.com/auth/userinfo.email`**: Identify the account
running Koli, solely to check local premium/trial access-code status. Not
used for any other purpose.

**`https://www.googleapis.com/auth/documents`**: Generate exported
documents (Creator One-Pager, Deal Memo, Shortlist Report, Performance
Report) as Google Docs the user can edit.

**`https://www.googleapis.com/auth/drive.file`** (sensitive scope):
Save those generated documents/PDFs into a "Koli Reports" folder created
by Koli in the user's own Drive. This scope only ever sees files Koli
itself creates — never the user's pre-existing Drive contents. (Note: an
earlier attempt at this same narrowing broke Export in a prior build,
since fixed by rewriting the Drive calls to use the Advanced Drive Service
API directly instead of the `DriveApp` object, which silently requires
broader `drive` access even when the manifest only declares `drive.file`.
**Test every Export action for real before trusting this in production.**)

**`https://www.googleapis.com/auth/script.send_mail`** (sensitive scope):
Send an outreach email on the user's behalf, only when they explicitly
click "Send Approved Drafts" after reviewing it. Cannot read the inbox,
contacts, or any existing message — send-only.

## What's still required, and can't be done from a file

- **A standard Google Cloud Platform project** linked to this Apps Script
  project (Apps Script's default auto-created project doesn't qualify) —
  set up in Cloud Console, under your Google account.
- **OAuth consent screen configuration and verification** for the two
  sensitive scopes above (`drive.file`, `script.send_mail`) — needs the
  Privacy Policy and Terms URLs below entered into the consent screen, plus:
- **A demonstration video** showing how each sensitive scope is actually
  used (a short screen recording is normal for `drive.file`-tier scopes —
  nowhere near the length a full `drive` scope walkthrough would need, but
  still a real video only you can record, showing your own account).
- **The Marketplace SDK listing itself** (this doc's content, the icon, and
  the two screenshots below) is configured in Cloud Console, not a file
  submission.
- Review timeline for OAuth verification: commonly 1-6 weeks depending on
  scope tier and how complete the submission is on the first pass.

## Live URLs (paste into the OAuth consent screen and the listing)
- **Privacy policy**: https://claude.ai/code/artifact/33f3cebe-477e-4f3c-ada6-20f4ed63446f
- **Terms of service**: https://claude.ai/code/artifact/6c28865a-b06a-4ab3-8961-78cf84fdbe7a

**Before submitting**: open both and use the Share menu to set "Anyone with
the link" — they're private by default, and Google's reviewers can't log
into your claude.ai account to view them.

## Assets in this package
- `koli-icon-128.png`: listing icon (also referenced as `appsscript.json`'s
  `addOns.common.logoUrl`, already live at
  https://claude.ai/code/artifact/b727df93-77b5-4a45-a7b4-8af97fa788b0/koli-icon-128.png)
- `screenshots/1-sidebar-channel-card.png`: the sidebar's live selected-row
  summary card (1280x800)
- `screenshots/2-sidebar-quick-settings.png`: the sidebar's Quick Settings
  drawer (1280x800)

Two more screenshots worth adding once you can capture them from a real
install: the CardService homepage card (the actual right-hand Add-ons panel
entry point — `onHomepage` in `addOnHomepage.gs` — can only be rendered by
Google's own add-on host, not simulated here), and the "Koli" custom menu
open over a real sheet.

## What shipped in code today
- `appsscript.json`: added the `addOns` block (`common` + `sheets`,
  `homepageTrigger: onHomepage`)
- `addOnHomepage.gs` (new file): a real, working CardService homepage card
  — not a stub — with buttons into Attention, Profile/Discover, and
  Settings, each calling the same functions the custom menu already uses
