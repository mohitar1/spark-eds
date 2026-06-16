/*
 * Copyright 2022 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { error, Router, withCookies } from 'itty-router';
import { authRouter, withAuthentication } from './auth';
import { originDynamicMedia } from './origin/dm';
import { originHelix } from './origin/helix';
import { originFadel } from './origin/fadel';
import { originPublish, originPublishPassthrough, originPublishChili } from './origin/publish';
import { publishShareRouter } from './origin/publish-routes';
import { parsePageExclusions, isUserExcluded } from './origin/page-access';
import { cors } from './util/itty';
import { apiUser } from './user';
import { savedSearchesApi } from './api/savedsearches';
import { rightsRequestsApi } from './api/rightsrequests';
import { notificationsApi } from './api/notifications';
import { analyticsApi } from './api/analytics';
import { exportUserLoginsCSV } from './api/user-logins';
import { collectionsApi } from './api/collections';
import { handleScheduledTokenRefresh } from './scheduled/token-refresh';
import { handleStatusReminders, handleUsageRightsReminders } from './scheduled/rights-reminders';

// Shared CORS origins
const allowedOrigins = [
  'https://spark-eds.adobesantander.workers.dev',
  /https:\/\/.*-spark-eds\.adobesantander\.workers\.dev$/,
  /http:\/\/localhost:.*/,
];

const BLOCKED_TLS = ['TLSv1', 'TLSv1.1'];

/** Block requests using outdated TLS versions (1.0, 1.1). */
function withTlsCheck(request) {
  const { hostname } = new URL(request.url);
  if (hostname === 'localhost') return undefined;

  const tlsVersion = request.cf?.tlsVersion;
  if (BLOCKED_TLS.includes(tlsVersion)) {
    return new Response(
      'Please use newer TLS version',
      { status: 403 },
    );
  }
  return undefined;
}

/** Switch to AEM preview content for preview hostnames. */
function withPreviewOrigin(request, env) {
  const { hostname } = new URL(request.url);
  if (hostname === 'preview.assets.coke.com'
      || (hostname.startsWith('preview-') && hostname.endsWith('.workers.dev'))) {
    request.helixOrigin = env.HELIX_ORIGIN.replace('.aem.live', '.aem.page');
    console.info(`Preview hostname detected: ${hostname}, using Helix origin: ${request.helixOrigin}`);
  }
}

const { preflight, corsify } = cors({
  origin: allowedOrigins,
  allowMethods: ['GET', 'POST', 'DELETE', 'PUT'],
  credentials: true,
  maxAge: 600,
});

const router = Router({
  before: [withTlsCheck, preflight, withPreviewOrigin],
  finally: [corsify],
  catch: (err) => {
    // log stack traces for debugging
    console.error('error', err);
    throw err;
  },
});

router
  // parse cookies (middleware)
  .all('*', (request) => {
    withCookies(request);
    // decode cookie values, not done by itty-router withCookies()
    for (const key in request.cookies) {
      request.cookies[key] = decodeURIComponent(request.cookies[key]);
    }
  })

  // login and logout flows (must come first)
  .all('*', authRouter.fetch)

  // public content
  .get('/public/download/original/*', originPublishPassthrough)
  .get('/rendition/*', originPublishPassthrough)
  .get('/public/*', originHelix)
  .get('/tools/*', originHelix)
  .get('/scripts/*', originHelix)
  .get('/styles/*', originHelix)
  .get('/blocks/*', originHelix)
  .get('/fonts/*', originHelix)
  .get('/icons/*', originHelix)
  .get('/favicon.ico', originHelix)
  .get('/robots.txt', originHelix)

  // Chili rendering engine: proxy Basic Auth requests for DAM assets directly
  // to AEM publish (bypasses Microsoft Entra auth which Chili can't provide)
  .all('/content/dam/*', originPublishChili)

  // SAML login: proxy Microsoft SAML POST to AEM publish for user provisioning
  .post('/content/share/saml_login', originPublishPassthrough)

  // from here on authentication required (middleware)
  .all('*', withAuthentication)

  // restrict config/access paths to users with 'admin' permission
  .all('/config/access/*', (request) => {
    if (!request.user?.roles?.includes('admin')) {
      return new Response('Forbidden', { status: 403 });
    }
  })

  // user info
  .get('/api/user', apiUser)

  // dynamic media
  .all('/api/adobe/assets/*', originDynamicMedia)

  // fadel
  .all('/api/fadel/*', originFadel)

  // Saved Searches API
  .all('/api/savedsearches/*', savedSearchesApi)

  // Rights Requests API
  .all('/api/rightsrequests/*', rightsRequestsApi)

  // Notifications API
  .all('/api/messages/*', notificationsApi)
  .all('/api/messages', notificationsApi)

  // Analytics API
  .get('/api/analytics/test', analyticsApi)
  .get('/api/analytics/report-metrics', analyticsApi)
  .get('/api/analytics/raw-downloads', analyticsApi)
  .all('/api/analytics/query-sql', analyticsApi)
  .all('/api/analytics/query', analyticsApi)
  .all('/api/analytics', analyticsApi)

  // User Logins API
  .get('/api/user-logins/csv', exportUserLoginsCSV)

  // Collections API (share-notify email)
  .all('/api/collections/*', collectionsApi)

  // future API routes
  .all('/api/*', () => error(404))

  // AEM CS Publish: /content/share/* handled by deny-by-default child router
  // (search redirects, template/print-jobs allowlist, .html deny, non-HTML proxy)
  .all('/content/share/*', publishShareRouter.fetch)
  .all('/content/experience-fragments/*', originPublish)
  .all('/content/dam/*', originPublish)
  .get('/content/dam.downloadbinaries.json', originPublish)
  .all('/home/users/*', originPublish)
  .all('/etc.clientlibs/*', originPublish)
  .all('/libs/*', originPublish)
  .all('/bin/tccc/*', originPublish)
  .get('/restricted/download/original/*', originPublish)

  .all('*', async (request, env) => {
    const response = await originHelix(request, env);

    // only enforce page access control on HTML pages for authenticated users
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') || !request.user) {
      return response;
    }

    // admin bypass
    if (request.user.roles?.includes('admin')) {
      return response;
    }

    const html = await response.clone().text();
    const exclusions = parsePageExclusions(html);
    if (isUserExcluded(request.user, exclusions)) {
      console.warn(`[PageAccess] Denied ${request.user.email} from ${new URL(request.url).pathname} (user roles: ${request.user.roles}, excluded: ${JSON.stringify(exclusions)})`);
      return Response.redirect(`${new URL(request.url).origin}/404.html`, 302);
    }

    return response;
  });

export default {
  ...router,
  /**
   * Scheduled handler for Cron Triggers
   * Uses multiple cron schedules:
   * - "0 0 1 * *" (1st of month at midnight UTC): OAuth token refresh
   * - "5 0 * * *" (everyday at 12:05 AM UTC): Rights request reminders (status + usage)
   * @see https://developers.cloudflare.com/workers/configuration/cron-triggers/
   * @see https://developers.cloudflare.com/workers/examples/multiple-cron-triggers/
   */
  async scheduled(controller, env, ctx) {
    switch (controller.cron) {
      case '0 0 1 * *':
        console.info('[Cron] Monthly token refresh triggered');
        await handleScheduledTokenRefresh(env, ctx);
        break;

      case '5 0 * * *':
        console.warn('[Cron] Nightly reminders triggered');
        await Promise.all([
          handleStatusReminders(env, ctx),
          handleUsageRightsReminders(env, ctx),
        ]);
        break;

      default:
        console.warn(`[Cron] Unknown cron schedule: ${controller.cron}`);
    }
  },
}
