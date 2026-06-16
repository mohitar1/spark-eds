/**
 * Email Service - Class-based abstraction for sending emails
 * 
 * Provides a simple, unified interface for sending emails with template support.
 * Handles all complexity internally - template loading, rendering, recipient handling, etc.
 * 
 * Usage:
 * const emailService = new EmailService(env, ctx);
 * 
 * // Send email with template
 * await emailService.send({
 *   to: 'user@example.com',
 *   subject: 'Welcome',
 *   template: 'rights-request-authorization',
 *   data: { userName: 'John', assetList: '<li>Asset 1</li>' }
 * });
 * 
 * // Send to multiple recipients
 * await emailService.send({
 *   to: ['user1@example.com', 'user2@example.com'],
 *   subject: 'New Request',
 *   template: 'rights-request-authorization',
 *   data: { ... }
 * });
 * 
 * // Send with raw HTML
 * await emailService.send({
 *   to: 'user@example.com',
 *   subject: 'Custom Email',
 *   html: '<html><body>Hello {{userName}}</body></html>',
 *   data: { userName: 'John' }
 * });
 */

import { renderTemplate } from './template-loader.js';
import { sendEmail as sendSingleEmail, sendEmailToMultiple, isEmailConfigured } from './email.js';

// Template registry - maps template names to template modules
const TEMPLATE_REGISTRY = {
  'rights-request-authorization': () => import('./templates/rights-request-authorization.js'),
  'rights-request-authorization-success': () => import('./templates/rights-request-authorization-success.js'),
  'rights-request-authorization-failed': () => import('./templates/rights-request-authorization-failed.js'),
  'rights-request-status-change': () => import('./templates/rights-request-status-change.js'),
  'rights-request-status-reminder': () => import('./templates/rights-request-status-reminder.js'),
  'rights-request-reviewer-assigned': () => import('./templates/rights-request-reviewer-assigned.js'),
  'rights-expiration-reminder': () => import('./templates/rights-expiration-reminder.js'),
  'shared-collection': () => import('./templates/shared-collection.js'),
};

/**
 * Email Service Class
 * Manages email sending with template support, validation, and error handling
 */
export class EmailService {
  /**
   * Create an email service instance
   * @param {Object} env - Cloudflare environment bindings
   * @param {Object} [ctx] - Execution context (for non-blocking with ctx.waitUntil)
   */
  constructor(env, ctx = null) {
    this.env = env;
    this.ctx = ctx;
  }

  /**
   * Get email template logo URL from environment
   * @returns {string} Logo URL
   * @private
   */
  getLogoUrl() {
    return this.env?.EMAIL_TEMPLATE_LOGO_URL || 'https://cocacola.scene7.com/is/image/cocacolastage/KO-Assets-logo-png-transparent-background?$chili-preview-without-height-and-width$';
  }

  /**
   * Check if email service is configured
   * @returns {boolean} True if email is configured
   */
  isConfigured() {
    return isEmailConfigured(this.env);
  }

  /**
   * Load and render email template
   * @param {string} templateName - Name of the template
   * @param {Object} data - Data to inject into template
   * @returns {Promise<string>} Rendered HTML
   * @private
   */
  async loadAndRenderTemplate(templateName, data) {
    const templateLoader = TEMPLATE_REGISTRY[templateName];
    if (!templateLoader) {
      throw new Error(`Template '${templateName}' not found. Available: ${Object.keys(TEMPLATE_REGISTRY).join(', ')}`);
    }

    const templateModule = await templateLoader();
    const templateHtml = templateModule.default;

    const templateData = {
      emailTemplateLogoUrl: this.getLogoUrl(),
      ...data,
    };

    return renderTemplate(templateHtml, templateData);
  }

  /**
   * Validate email configuration
   * @param {Object} config - Email configuration object
   * @throws {Error} If configuration is invalid
   * @private
   */
  validateConfig(config) {
    if (!config.to) {
      throw new Error('Email configuration must include "to" field (string or array)');
    }

    if (!config.subject) {
      throw new Error('Email configuration must include "subject" field');
    }

    if (!config.template && !config.html) {
      throw new Error('Email configuration must include either "template" or "html"');
    }

    if (config.template && config.html) {
      throw new Error('Email configuration cannot include both "template" and "html"');
    }

    if (config.template && !config.data) {
      console.warn('[EmailService] Template specified but no data provided');
    }
  }

  /**
   * Send email (automatically non-blocking if ctx provided)
   * 
   * @param {Object} config - Email configuration
   * @param {string|string[]} config.to - Recipient email(s)
   * @param {string} config.subject - Email subject
   * @param {string} [config.template] - Template name
   * @param {string} [config.html] - Raw HTML string
   * @param {Object} [config.data] - Data for template variables
   * @param {Object} [options] - Send options
   * @param {boolean} [options.blocking=false] - Wait for email to send (overrides ctx behavior)
   * @returns {Promise<Object>} Result object
   * 
   * @example
   * // Auto non-blocking (if ctx provided in constructor)
   * await emailService.send({
   *   to: 'user@example.com',
   *   subject: 'Welcome',
   *   template: 'rights-request-authorization',
   *   data: { userName: 'John' }
   * });
   * 
   * @example
   * // Force blocking
   * await emailService.send({
   *   to: 'user@example.com',
   *   subject: 'Welcome',
   *   template: 'rights-request-authorization',
   *   data: { userName: 'John' }
   * }, { blocking: true });
   */
  async send(config, options = {}) {
    const { to, subject, template, html: rawHtml, data = {} } = config;
    const { blocking = false } = options;

    // Validate configuration
    try {
      this.validateConfig(config);
    } catch (error) {
      console.error('[EmailService] Validation failed:', error.message);
      return { success: false, error: error.message };
    }

    // Check if email is configured
    if (!this.isConfigured()) {
      console.warn('[EmailService] Email not configured. Skipping.');
      return { success: false, error: 'Email not configured', skipped: true };
    }

    // Prepare email sending function
    const sendTask = async () => {
      try {
        // Get HTML content
        let htmlContent;
        if (template) {
          htmlContent = await this.loadAndRenderTemplate(template, data);
        } else {
          const templateData = {
            emailTemplateLogoUrl: this.getLogoUrl(),
            ...data,
          };
          htmlContent = renderTemplate(rawHtml, templateData);
        }

        // Prepare email data
        const emailData = { subject, html: htmlContent };

        // Send to single or multiple recipients
        const isMultiple = Array.isArray(to);

        if (isMultiple) {
          await sendEmailToMultiple(this.env, to, emailData);
          console.log(`[EmailService] ✓ Sent to ${to.length} recipients: ${subject}`);
          return { success: true, recipients: to, count: to.length, subject };
        } else {
          await sendSingleEmail(this.env, { to, ...emailData });
          console.log(`[EmailService] ✓ Sent to ${to}: ${subject}`);
          return { success: true, recipient: to, subject };
        }
      } catch (error) {
        console.error('[EmailService] Send failed:', error);
        return { success: false, error: error.message };
      }
    };

    // Auto non-blocking if ctx provided (unless blocking explicitly requested)
    if (!blocking && this.ctx && this.ctx.waitUntil) {
      this.ctx.waitUntil(sendTask());
      return { success: true, queued: true };
    }

    // Blocking mode or no ctx
    if (blocking) {
      return await sendTask();
    } else {
      sendTask(); // Fire and forget
      return { success: true, queued: true };
    }
  }

  /**
   * Register a new email template
   * @param {string} name - Template name
   * @param {Function} loader - Async function returning template module
   */
  static registerTemplate(name, loader) {
    if (TEMPLATE_REGISTRY[name]) {
      console.warn(`[EmailService] Template '${name}' already exists. Overwriting...`);
    }
    TEMPLATE_REGISTRY[name] = loader;
    console.log(`[EmailService] Template '${name}' registered`);
  }

  /**
   * Get available template names
   * @returns {string[]} Array of template names
   */
  static getAvailableTemplates() {
    return Object.keys(TEMPLATE_REGISTRY);
  }

  /**
   * Check if template exists
   * @param {string} name - Template name
   * @returns {boolean} True if exists
   */
  static hasTemplate(name) {
    return !!TEMPLATE_REGISTRY[name];
  }
}

/**
 * Create email service instance (convenience function)
 * @param {Object} env - Cloudflare environment bindings
 * @param {Object} [ctx] - Execution context
 * @returns {EmailService} Email service instance
 */
export function createEmailService(env, ctx = null) {
  return new EmailService(env, ctx);
}
