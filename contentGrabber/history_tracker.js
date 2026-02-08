/**
 * Browser History Tracker
 * Tracks user's browsing history for learning context analysis
 */

/**
 * Get recent browsing history
 * @param {number} maxResults - Maximum number of history items to retrieve
 * @param {number} hoursBack - How many hours back to look
 * @returns {Promise<Array>} Array of history items
 */
async function getRecentHistory(maxResults = 100, hoursBack = 24) {
  try {
    const endTime = Date.now();
    const startTime = endTime - (hoursBack * 60 * 60 * 1000);
    
    const historyItems = await chrome.history.search({
      text: '', // Empty string returns all history
      startTime: startTime,
      endTime: endTime,
      maxResults: maxResults
    });
    
    return historyItems.map(item => ({
      id: item.id,
      url: item.url,
      title: item.title || '',
      visitCount: item.visitCount || 0,
      lastVisitTime: item.lastVisitTime,
      typedCount: item.typedCount || 0
    }));
  } catch (error) {
    console.error('[HistoryTracker] Error getting history:', error);
    return [];
  }
}

/**
 * Get history for specific domain
 * @param {string} domain - Domain to filter by (e.g., 'docs.google.com')
 * @param {number} maxResults - Maximum results
 * @returns {Promise<Array>} Filtered history items
 */
async function getHistoryForDomain(domain, maxResults = 50) {
  try {
    const historyItems = await chrome.history.search({
      text: domain,
      maxResults: maxResults
    });
    
    return historyItems
      .filter(item => new URL(item.url).hostname.includes(domain))
      .map(item => ({
        id: item.id,
        url: item.url,
        title: item.title || '',
        visitCount: item.visitCount || 0,
        lastVisitTime: item.lastVisitTime
      }));
  } catch (error) {
    console.error('[HistoryTracker] Error getting domain history:', error);
    return [];
  }
}

/**
 * Get visit details for a URL
 * @param {string} url - URL to get visit details for
 * @returns {Promise<Array>} Visit details
 */
async function getVisitDetails(url) {
  try {
    const visits = await chrome.history.getVisits({ url: url });
    return visits.map(visit => ({
      id: visit.id,
      visitTime: visit.visitTime,
      transition: visit.transition, // 'link', 'typed', 'reload', etc.
      visitId: visit.visitId
    }));
  } catch (error) {
    console.error('[HistoryTracker] Error getting visit details:', error);
    return [];
  }
}

/**
 * Track page visit and send to backend
 * @param {Object} tab - Chrome tab object
 */
async function trackPageVisit(tab) {
  try {
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      return;
    }
    
    // Get visit details
    const visits = await getVisitDetails(tab.url);
    const lastVisit = visits[0];
    
    // Send to backend
    const response = await authenticatedFetch('/api/extension/history/track', {
      method: 'POST',
      body: JSON.stringify({
        url: tab.url,
        title: tab.title || '',
        visitTime: lastVisit ? lastVisit.visitTime : Date.now(),
        transition: lastVisit ? lastVisit.transition : 'unknown',
        visitCount: visits.length
      })
    });
    
    if (response.ok) {
      console.log('[HistoryTracker] Visit tracked:', tab.url);
    }
  } catch (error) {
    console.error('[HistoryTracker] Error tracking visit:', error);
  }
}

/**
 * Analyze browsing patterns for learning context
 * @param {number} daysBack - Days to analyze
 * @returns {Promise<Object>} Analysis results
 */
async function analyzeBrowsingPatterns(daysBack = 7) {
  try {
    const hoursBack = daysBack * 24;
    const history = await getRecentHistory(500, hoursBack);
    
    // Group by domain
    const domainGroups = {};
    history.forEach(item => {
      try {
        const domain = new URL(item.url).hostname;
        if (!domainGroups[domain]) {
          domainGroups[domain] = {
            domain: domain,
            visits: 0,
            urls: [],
            lastVisit: 0
          };
        }
        domainGroups[domain].visits += item.visitCount || 1;
        domainGroups[domain].urls.push(item.url);
        if (item.lastVisitTime > domainGroups[domain].lastVisit) {
          domainGroups[domain].lastVisit = item.lastVisitTime;
        }
      } catch (e) {
        // Skip invalid URLs
      }
    });
    
    // Sort by visit count
    const topDomains = Object.values(domainGroups)
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 20);
    
    return {
      totalVisits: history.length,
      topDomains: topDomains,
      learningSites: topDomains.filter(d => 
        d.domain.includes('docs.google.com') ||
        d.domain.includes('github.com') ||
        d.domain.includes('stackoverflow.com') ||
        d.domain.includes('developer.mozilla.org') ||
        d.domain.includes('medium.com')
      )
    };
  } catch (error) {
    console.error('[HistoryTracker] Error analyzing patterns:', error);
    return { totalVisits: 0, topDomains: [], learningSites: [] };
  }
}

// Export functions for use in background.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getRecentHistory,
    getHistoryForDomain,
    getVisitDetails,
    trackPageVisit,
    analyzeBrowsingPatterns
  };
}
