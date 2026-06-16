/**
 * Analytics Helper Module
 * Provides utilities for tracking analytics events from server-side code
 */

/**
 * Send analytics event to Analytics Engine
 * @param {Object} env - Cloudflare env with KO_ANALYTICS_ENGINE_TEST binding
 * @param {string} eventType - 'login', 'search', or 'download'
 * @param {Object} eventData - Event data matching writeAnalyticsEvent schema
 * @returns {Promise<void>}
 */
export async function trackAnalyticsEvent(env, eventType, eventData) {
  if (!env.KO_ANALYTICS_ENGINE_TEST) {
    console.warn('[Analytics] Analytics Engine not available');
    return;
  }
  
  try {
    const { writeAnalyticsEvent } = await import('../api/analytics.js');
    await writeAnalyticsEvent(env.KO_ANALYTICS_ENGINE_TEST, eventType, eventData, env);
    if (env.DEBUG_ANALYTICS) {
      console.info(`[Analytics] ${eventType} event tracked:`, eventData.koid);
    }
  } catch (error) {
    console.error(`[Analytics] Failed to track ${eventType} event:`, error);
    // Don't throw - analytics failures should not break the main flow
  }
}

