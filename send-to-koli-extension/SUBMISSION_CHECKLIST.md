# Chrome Web Store Submission Checklist

## Live URLs (paste these into the dashboard)
- **Privacy policy**: https://claude.ai/code/artifact/4d2864ed-44d8-4fed-b621-9fb5e3dcf557
- **Terms of service**: https://claude.ai/code/artifact/cb13d796-4ece-4e0c-a1d6-a26f7c2acd06

**Before submitting**: open each link and use its Share menu to set it to "Anyone with the link" (they publish private by default). Google's reviewers need to open these without a claude.ai login, and installed users will click them too.

## What to upload where (developer.chrome.com/webstore/devconsole)

1. **Package**: upload `send-to-koli-v2.1.0.zip` as-is. It contains only the extension's runtime files (manifest.json, background.js, sidepanel.html, sidepanel.js, icons/) — nothing else needs to go in this zip.
2. **Store listing**: copy every field from `STORE_LISTING.md` — store name, short description, detailed description, category.
3. **Screenshots**: upload all 5 PNGs in `store-screenshots/` (already at the required 1280x800).
4. **Icon**: `icons/icon128.png` (already correct size; the dashboard pulls 16/48 from the manifest automatically for other surfaces).
5. **Privacy practices tab**: this is where the two URLs above go, plus Chrome's separate data-disclosure checkboxes (declare what's collected — per `PRIVACY_POLICY.md`, that's none beyond the two locally-stored config values, which don't need disclosing as "collected").
6. **Permissions justification**: paste the four justifications from `STORE_LISTING.md`'s "Permission justifications" section into the matching fields — Chrome now requires text justification for `host_permissions: <all_urls>` specifically, not just a general description.

## Still needs a real browser, not something I can generate

Two screenshots genuinely require a live browser session with the extension loaded (see `STORE_LISTING.md` for exact steps): a native right-click context menu screenshot, and a real Koli sheet showing captured data. Optional — Chrome Web Store doesn't require all 5 slots to be these two, the 5 already provided are valid and sufficient to submit today.

## Known open item

Both legal docs are marked as drafts pending a real review (see the notice at the top of each). Submitting with them as-is is a judgment call on your side, not a technical blocker.

## The other half: Google Workspace Marketplace (the Sheets-side "worksheet addon")

This is a materially different, bigger process than the Chrome Web Store — flagging clearly rather than quietly building toward a wrong assumption:

- Koli today is a script **bound to your own spreadsheet**. Installing it into someone else's Sheets as a real add-on means either (a) they make their own copy of your template spreadsheet (near-zero process, no Google review, works today), or (b) publishing through the **Google Workspace Marketplace SDK** as a proper installable add-on, which needs: an `addOns` block in `appsscript.json` (different shape than a bound script), a Marketplace listing (icons, screenshots, description — same shape as above but a separate submission), and — the part outside anyone's control — **OAuth consent screen verification**, which is mandatory for the scopes Koli uses (`drive.file`, `documents`, `script.send_mail`) and can take **days to several weeks**, sometimes requiring a screencast demo of every scope's use. There's no "ASAP" path through that part; it's Google's review queue, not a packaging problem.

Tell me which of (a) or (b) you actually want and I'll prepare the specific package for it — they need different assets entirely, so building both blind would waste effort.
