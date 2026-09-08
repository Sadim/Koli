# Koli — Operator's Guide

This is the "how do I actually use this day to day" guide. For setup and
technical details, see README.md.

## A typical outreach week

**Finding creators**
1. Have a channel in mind already? Koli > Analyze Channels, paste it, Run.
2. Don't have one in mind? Koli > Discover — give it a channel you already
   like as a seed, pick Channels, Run. Up to 5 similar channels land in
   Discover Results. Anything you want to look at closer, copy the link
   into Analyze Channels.

**Vetting before you reach out**
- Check the Auth (comment authenticity) score and the Channel note (About
  summary) on the Channels sheet before reaching out — a low authenticity
  score or a mismatched niche is worth catching before you spend time on
  a pitch.
- Check the Sponsors tab for that channel's ID — if brands are already
  showing up there, you know they accept sponsorships, which is worth
  knowing before your first email.

**Reaching out**
1. Set the Outreach column to "Contacted" the day you send.
2. Log a one-line note in Notes if anything's worth remembering (their
   rate, a scheduling constraint, who you spoke to).
3. Update Last Contact each time you follow up.
4. If someone says no or you decide to drop it, set Outreach to "Passed."
   If someone has a closed-door policy, set it to "Do Not Contact" —
   Discover will stop suggesting them.

**Sending a pitch**
- Click any cell in that creator's row on Channels, then Koli > Export >
  Creator One-Pager. A pitch-ready PDF lands in the "Koli Reports" Drive
  folder, and a link appears in that row's Report column. Attach the PDF
  directly to your outreach email.

## Tracking a channel's performance over time

If you want more than a one-time snapshot — actual history for a channel
you're already working with or watching closely:

1. Koli > Profile. Paste the channel link, set a date range (defaults to
   the last 30 days), check "Track this channel going forward," Run.
2. One row per video lands in the Profile tab for that window.
3. From then on, Koli > Refresh Tracked Profiles pulls whatever's new
   for every tracked channel in one click — no need to remember dates.

## Reading the Channels sheet at a glance

| Column | What it tells you |
|---|---|
| Auth (on Videos/Profile) | Comment authenticity, 1-10. Below ~5, look closer before pitching. |
| CPM | A range, not a quote — starting point for a rate conversation, not gospel. |
| Email | Type over it any time — Koli won't overwrite a manual entry on re-run. |
| Outreach | Your pipeline status — the one column you should be touching most. |
| Report | Auto-filled once you've exported a one-pager for that row. |

## When something looks wrong

- **A field says "Not found" or "Insufficient signal"** — that's Koli being
  honest about a real limit (no email findable, not enough comment data
  to estimate audience), not a bug. Fill in what you know manually where
  the field allows it (Email does; audience estimates don't).
- **Gemini 429 error** — you've hit the free-tier rate limit. Wait a
  minute, try again. Running fewer items per batch also helps.
- **Anything else looks broken** — tell me exactly what you see (a
  screenshot helps) and I'll fix the code, not just explain it away.
