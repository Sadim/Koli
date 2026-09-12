/**
 * addOnHomepage.gs
 * Entry point for Koli as a Google Workspace Add-on (the right-hand panel
 * icon, distinct from the "Koli" custom menu and the Sidebar.html-based
 * Profile/Discover panels those menu items open). Workspace Add-ons render
 * through CardService, not HtmlService -- a different UI surface from
 * everything else in this file, which is why this lives in its own file
 * rather than folding into uiHandlers.gs.
 *
 * Deliberately thin: every button here just calls a function that already
 * exists (uiHandlers.gs/attentionService.gs), then falls back to the
 * classic HtmlService sidebar/dialog for the actual work. The add-on
 * surface is a launcher into the real UI, not a second UI to keep in sync.
 */
function onHomepage(e) {
  const header = CardService.newCardHeader()
    .setTitle('Koli')
    .setSubtitle('v' + KOLI_VERSION);

  const section = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText(
      'Influencer-marketing research and outreach, right inside this spreadsheet. Open a screen below, or use the "Koli" menu for everything else.'
    ))
    .addWidget(CardService.newTextButton()
      .setText('Attention: what needs you today')
      .setOnClickAction(CardService.newAction().setFunctionName('onHomepageOpenAttention_')))
    .addWidget(CardService.newTextButton()
      .setText('Open Profile / Discover')
      .setOnClickAction(CardService.newAction().setFunctionName('onHomepageOpenProfile_')))
    .addWidget(CardService.newTextButton()
      .setText('Settings')
      .setOnClickAction(CardService.newAction().setFunctionName('onHomepageOpenSettings_')));

  return CardService.newCardBuilder().setHeader(header).addSection(section).build();
}

function onHomepageOpenAttention_() {
  showAttentionView();
  return CardService.newActionResponseBuilder().build();
}

function onHomepageOpenProfile_() {
  showProfileSidebar();
  return CardService.newActionResponseBuilder().build();
}

function onHomepageOpenSettings_() {
  showSettingsDialog();
  return CardService.newActionResponseBuilder().build();
}
