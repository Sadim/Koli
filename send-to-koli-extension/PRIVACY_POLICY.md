# Send to Koli — Privacy Policy

**Draft — have this reviewed before publishing, same as any other legal
document in this project. This is a starting point, not a final policy.**

Last updated: [DATE]

## What this extension does

"Send to Koli" lets you right-click a link or selected text on any
webpage and send it to a Google Sheet you control, running a tool
called Koli.

## What data is accessed, and when

The extension only accesses page content when you explicitly trigger
it — right-clicking a YouTube link and choosing "Send to Worksheet →
Channel" or "→ Video," right-clicking selected text and choosing "Send
selection to Koli as a note," right-clicking a page and choosing "Send
this page to Worksheet → Channel" or "→ Video," or — once you've set up
a profile for another platform — right-clicking anything and choosing
"Send to [Platform Name]."
Nothing is read, collected, or transmitted automatically or in the
background. Specifically, when you trigger one of these actions, the
extension sends:

- The link URL, or your selected text
- The page's title
- The page's URL (as context, alongside a selection)

## Where that data goes

**It goes to a Google Apps Script Web App endpoint that you — the
person using this extension — deploy and control yourself**, using
your own Google account. This is not a server operated by the
extension's developer. The developer of this extension never receives,
sees, or has access to any data sent through it. You configure the
destination URL yourself in the extension's settings page.

## What's stored locally

The extension stores two things in your browser (via Chrome's
`storage.sync`, tied to your own Google account, not sent anywhere
except to your configured endpoint): the Web App URL you've entered,
and the shared secret you've set. Neither is visible to the extension's
developer or to any third party.

## What this extension does NOT do

- Does not track your browsing activity
- Does not collect analytics or telemetry
- Does not sell, share, or transmit data to any third party
- Does not read or transmit page content unless you explicitly trigger
  one of the actions listed above

## Why this extension requests broad host permissions

This extension requests permission to run on any website (`<all_urls>`)
because its core purpose — sending a link or note from *any* page you're
browsing, not just YouTube — requires it. The context menu items are
inert until you click one; the permission enables the feature to work
everywhere you might want to use it, not passive data collection.

## Contact

Questions about this policy: [CONTACT EMAIL]
