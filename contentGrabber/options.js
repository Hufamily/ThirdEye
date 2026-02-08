/**
 * OPTIONS PAGE SCRIPT
 * Handles saving and loading user settings for ThirdEye extension,
 * including direct provider integrations (K2, Gemini, Dedalus).
 */

const DEFAULTS = {
  analyze_api_url: 'http://localhost:8000/analyze',
  gaze_api_url: 'http://localhost:8000/gaze',

  llm_provider_mode: 'backend',

  k2_base_url: '',
  k2_chat_path: '/v1/chat/completions',
  k2_model: 'k2-think',
  k2_api_key: '',

  gemini_model: 'gemini-1.5-pro',
  gemini_api_key: '',

  dedalus_base_url: '',
  dedalus_chat_path: '/v1/chat/completions',
  dedalus_model: 'dedalus-default',
  dedalus_api_key: '',
};

const FIELD_MAP = {
  analyze_api_url: 'apiUrl',
  gaze_api_url: 'gazeUrl',

  llm_provider_mode: 'providerMode',

  k2_base_url: 'k2BaseUrl',
  k2_chat_path: 'k2ChatPath',
  k2_model: 'k2Model',
  k2_api_key: 'k2ApiKey',

  gemini_model: 'geminiModel',
  gemini_api_key: 'geminiApiKey',

  dedalus_base_url: 'dedalusBaseUrl',
  dedalus_chat_path: 'dedalusChatPath',
  dedalus_model: 'dedalusModel',
  dedalus_api_key: 'dedalusApiKey',
};

function showStatus(message, isSuccess = true) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.style.display = 'block';
  status.className = isSuccess ? 'success' : 'error';

  setTimeout(() => {
    status.style.display = 'none';
    status.className = '';
  }, 3500);
}

function validateUrlIfPresent(url) {
  if (!url || url.trim() === '') return true;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function getFieldValue(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function setFieldValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value ?? '';
}

async function loadSettings() {
  try {
    const keys = Object.keys(DEFAULTS);
    const stored = await chrome.storage.local.get(keys);

    keys.forEach((key) => {
      const id = FIELD_MAP[key];
      if (!id) return;
      const value = stored[key] !== undefined ? stored[key] : DEFAULTS[key];
      setFieldValue(id, value);
    });
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Error loading settings', false);
  }
}

function buildSettingsFromForm() {
  const settings = {};
  Object.entries(FIELD_MAP).forEach(([key, id]) => {
    settings[key] = getFieldValue(id);
  });
  return settings;
}

function validateSettings(settings) {
  if (!validateUrlIfPresent(settings.analyze_api_url)) {
    return 'Invalid Analysis API URL format.';
  }
  if (!validateUrlIfPresent(settings.gaze_api_url)) {
    return 'Invalid Gaze API URL format.';
  }
  if (!validateUrlIfPresent(settings.k2_base_url)) {
    return 'Invalid K2 Base URL format.';
  }
  if (!validateUrlIfPresent(settings.dedalus_base_url)) {
    return 'Invalid Dedalus Base URL format.';
  }

  const provider = settings.llm_provider_mode;
  if (provider === 'k2') {
    if (!settings.k2_base_url) return 'K2 mode requires K2 Base URL.';
    if (!settings.k2_model) return 'K2 mode requires K2 model.';
    if (!settings.k2_api_key) return 'K2 mode requires K2 API key.';
  }
  if (provider === 'gemini') {
    if (!settings.gemini_model) return 'Gemini mode requires Gemini model.';
    if (!settings.gemini_api_key) return 'Gemini mode requires Gemini API key.';
  }
  if (provider === 'dedalus') {
    if (!settings.dedalus_base_url) return 'Dedalus mode requires Dedalus Base URL.';
    if (!settings.dedalus_model) return 'Dedalus mode requires Dedalus model.';
    if (!settings.dedalus_api_key) return 'Dedalus mode requires Dedalus API key.';
  }

  return null;
}

document.getElementById('save').addEventListener('click', async () => {
  const settings = buildSettingsFromForm();
  const validationError = validateSettings(settings);
  if (validationError) {
    showStatus(validationError, false);
    return;
  }

  try {
    await chrome.storage.local.set(settings);
    showStatus('✓ Settings saved successfully!', true);
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('Error saving settings', false);
  }
});

document.getElementById('reset').addEventListener('click', async () => {
  if (!confirm('Reset all settings to defaults? This cannot be undone.')) return;

  try {
    await chrome.storage.local.set(DEFAULTS);
    Object.entries(FIELD_MAP).forEach(([key, id]) => {
      setFieldValue(id, DEFAULTS[key]);
    });
    showStatus('✓ Reset to default settings', true);
  } catch (error) {
    console.error('Error resetting settings:', error);
    showStatus('Error resetting settings', false);
  }
});

document.addEventListener('DOMContentLoaded', loadSettings);
