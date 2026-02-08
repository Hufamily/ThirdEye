const DEFAULT_API_BASE = 'http://localhost:8000';

function onOpen() {
  DocumentApp.getUi()
    .createMenu('Third Eye')
    .addItem('Open Assistant', 'showSidebar')
    .addItem('Sync AOI Map', 'syncCurrentDoc')
    .addToUi();
}

function onInstall(e) {
  onOpen(e);
}

function onHomepage() {
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Third Eye'))
    .addSection(
      CardService.newCardSection()
        .addWidget(CardService.newTextParagraph().setText('Open the assistant from Extensions > Third Eye > Open Assistant.'))
    )
    .build();
  return card;
}

function showSidebar() {
  const html = HtmlService.createTemplateFromFile('Sidebar')
    .evaluate()
    .setTitle('Third Eye Assistant');
  DocumentApp.getUi().showSidebar(html);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getSettings() {
  const props = PropertiesService.getUserProperties();
  return {
    apiBase: props.getProperty('THIRDEYE_API_BASE') || DEFAULT_API_BASE,
    bearerToken: props.getProperty('THIRDEYE_BEARER_TOKEN') || '',
    orgId: props.getProperty('THIRDEYE_ORG_ID') || '',
    provider: props.getProperty('THIRDEYE_PROVIDER') || 'stub',
  };
}

function saveSettings(input) {
  const props = PropertiesService.getUserProperties();
  props.setProperty('THIRDEYE_API_BASE', input.apiBase || DEFAULT_API_BASE);
  props.setProperty('THIRDEYE_BEARER_TOKEN', input.bearerToken || '');
  props.setProperty('THIRDEYE_ORG_ID', input.orgId || '');
  props.setProperty('THIRDEYE_PROVIDER', input.provider || 'stub');
  return { ok: true };
}

function getCurrentDocContext() {
  const doc = DocumentApp.getActiveDocument();
  const docId = doc.getId();
  const docTitle = doc.getName();

  let selectedText = '';
  let cursorRange = null;

  const selection = doc.getSelection();
  if (selection) {
    const elements = selection.getRangeElements();
    selectedText = elements
      .map((el) => {
        const text = el.getElement().editAsText().getText();
        if (el.isPartial()) {
          return text.substring(el.getStartOffset(), el.getEndOffsetInclusive() + 1);
        }
        return text;
      })
      .join(' ')
      .trim();
  } else {
    const cursor = doc.getCursor();
    if (cursor) {
      const el = cursor.getElement();
      if (el && el.editAsText) {
        const t = el.editAsText().getText();
        const off = cursor.getOffset();
        const start = Math.max(0, off - 120);
        const end = Math.min(t.length, off + 280);
        selectedText = t.substring(start, end).trim();
      }
    }
  }

  // Google Apps Script doesn't expose Docs API absolute indices directly from DocumentApp.
  // For v1 backend, selected_text is enough and cursor_range remains optional.
  if (selectedText) {
    cursorRange = { startIndex: 0, endIndex: selectedText.length };
  }

  return {
    docId: docId,
    docTitle: docTitle,
    selectedText: selectedText,
    cursorRange: cursorRange,
  };
}

function syncCurrentDoc() {
  const settings = getSettings();
  if (!settings.bearerToken || !settings.orgId) {
    throw new Error('Please set Bearer token and Org ID in sidebar settings first.');
  }

  const doc = DocumentApp.getActiveDocument();
  const payload = {
    org_id: settings.orgId,
    google_doc_id: doc.getId(),
    title: doc.getName(),
    google_access_token: ScriptApp.getOAuthToken(),
  };

  const response = callBackend('/v1/docs/sync', 'post', payload, settings);
  return response;
}

function getNeedHelpSignal() {
  const settings = getSettings();
  if (!settings.bearerToken || !settings.orgId) {
    return { enabled: false, reason: 'missing_settings' };
  }

  const docId = DocumentApp.getActiveDocument().getId();
  const endpoint = '/v1/orgs/' + encodeURIComponent(settings.orgId) + '/analytics?doc_id=' + encodeURIComponent(docId);
  const analytics = callBackend(endpoint, 'get', null, settings);

  if (!analytics || !analytics.top_confusing_sections || analytics.top_confusing_sections.length === 0) {
    return { enabled: false, reason: 'no_signals' };
  }

  const top = analytics.top_confusing_sections[0];
  const confused = (top.metrics && top.metrics.confusion_flags) || 0;
  if (confused <= 0) {
    return { enabled: false, reason: 'no_confusion' };
  }

  return {
    enabled: true,
    aoiKey: top.aoi_key,
    snippet: top.snippet || '',
    reason: 'confusion_signal',
  };
}

function requestAssist(action, aoiKeyOverride) {
  const settings = getSettings();
  if (!settings.bearerToken || !settings.orgId) {
    throw new Error('Please set Bearer token and Org ID in sidebar settings first.');
  }

  const ctx = getCurrentDocContext();
  const payload = {
    org_id: settings.orgId,
    doc_id: ctx.docId,
    aoi_key: aoiKeyOverride || null,
    selected_text: ctx.selectedText || '',
    cursor_range: ctx.cursorRange,
    action: action || 'explain',
    provider: settings.provider || 'stub',
    google_access_token: ScriptApp.getOAuthToken(),
  };

  return callBackend('/v1/assist', 'post', payload, settings);
}

function sendFeedback(feedbackType, aoiKey) {
  const settings = getSettings();
  if (!settings.bearerToken || !settings.orgId) {
    throw new Error('Missing settings');
  }

  const ctx = getCurrentDocContext();
  const now = Date.now();

  const event = {
    org_id: settings.orgId,
    doc_id: ctx.docId,
    aoi_key: aoiKey || null,
    state: feedbackType === 'already_know' ? 'known' : (feedbackType === 'deeper' ? 'interested' : 'not_confused'),
    dwell_ms: 0,
    regressions: 0,
    timestamp_ms: now,
    metadata: {
      source: 'google_docs_sidebar_feedback',
      feedback_type: feedbackType,
    },
  };

  return callBackend('/v1/events/ingest', 'post', { events: [event] }, settings);
}

function callBackend(path, method, payload, settings) {
  const base = (settings.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
  const url = base + path;

  const options = {
    method: (method || 'get').toUpperCase(),
    headers: {
      Authorization: 'Bearer ' + settings.bearerToken,
      'Content-Type': 'application/json',
    },
    muteHttpExceptions: true,
  };

  if (payload !== null && payload !== undefined) {
    options.payload = JSON.stringify(payload);
  }

  const resp = UrlFetchApp.fetch(url, options);
  const code = resp.getResponseCode();
  const text = resp.getContentText() || '{}';

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    parsed = { raw: text };
  }

  if (code >= 400) {
    throw new Error('Backend error (' + code + '): ' + text);
  }

  return parsed;
}
