/**
 * OPTIONS PAGE SCRIPT
 * Handles saving and loading user settings for ThirdEye extension
 */

const DEFAULT_API_URL = 'http://localhost:8000/analyze';
const DEFAULT_GAZE_URL = 'http://localhost:8000/gaze';

/**
 * Show status message to user
 */
function showStatus(message, isSuccess = true) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = isSuccess ? 'success' : 'error';
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    status.className = '';
  }, 3000);
}

/**
 * Load saved settings and populate form
 */
async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get(['analyze_api_url', 'gaze_api_url']);
    const apiUrl = stored.analyze_api_url || DEFAULT_API_URL;
    const gazeUrl = stored.gaze_api_url || DEFAULT_GAZE_URL;
    document.getElementById('apiUrl').value = apiUrl;
    document.getElementById('gazeUrl').value = gazeUrl;
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Error loading settings', false);
  }
}

/**
 * Validate API URL format
 */
function validateApiUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Save settings
 */
document.getElementById('save').addEventListener('click', async () => {
  const apiUrl = document.getElementById('apiUrl').value.trim();
  const gazeUrl = document.getElementById('gazeUrl').value.trim();
  
  if (!apiUrl) {
    showStatus('Analysis API URL cannot be empty', false);
    return;
  }
  
  // Validate API URL
  if (!validateApiUrl(apiUrl)) {
    showStatus('Invalid Analysis API URL format. Example: http://localhost:8000/analyze', false);
    return;
  }
  
  // Validate Gaze URL if provided
  if (gazeUrl && !validateApiUrl(gazeUrl)) {
    showStatus('Invalid Gaze API URL format. Example: http://localhost:8000/gaze', false);
    return;
  }
  
  try {
    await chrome.storage.local.set({ 
      analyze_api_url: apiUrl,
      gaze_api_url: gazeUrl
    });
    showStatus('✓ Settings saved successfully!', true);
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('Error saving settings', false);
  }
});

/**
 * Reset to default
 */
document.getElementById('reset').addEventListener('click', async () => {
  if (confirm('Reset all settings to defaults? This cannot be undone.')) {
    try {
      await chrome.storage.local.set({ 
        analyze_api_url: DEFAULT_API_URL,
        gaze_api_url: DEFAULT_GAZE_URL
      });
      document.getElementById('apiUrl').value = DEFAULT_API_URL;
      document.getElementById('gazeUrl').value = DEFAULT_GAZE_URL;
      showStatus('✓ Reset to default settings', true);
    } catch (error) {
      console.error('Error resetting settings:', error);
      showStatus('Error resetting settings', false);
    }
  }
});

/**
 * Load settings when page loads
 */
document.addEventListener('DOMContentLoaded', loadSettings);
