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
import { apiUser } from './user';
import { cors } from './util/itty';

// Shared CORS origins
const allowedOrigins = [
  // worker URLs
  'https://spark-eds.adobesantander.workers.dev',
  /https:\/\/.*-spark-eds\.adobesantander\.workers\.dev$/,
  /http:\/\/localhost:.*/,
];

const { preflight, corsify } = cors({
  origin: allowedOrigins,
  allowMethods: ['GET', 'POST', 'DELETE', 'PUT'],
  credentials: true,
  maxAge: 600,
});

const router = Router({
  before: [preflight],
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
  .get('/public/*', originHelix)
  .get('/tools/*', originHelix)
  .get('/scripts/*', originHelix)
  .get('/styles/*', originHelix)
  .get('/blocks/*', originHelix)
  .get('/fonts/*', originHelix)
  .get('/icons/*', originHelix)
  .get('/favicon.ico', originHelix)
  .get('/robots.txt', originHelix)

  // from here on authentication required (middleware)
  .all('*', withAuthentication)

  // user info
  .get('/api/user', apiUser)

  // dynamic media
  .all('/api/adobe/assets/*', originDynamicMedia)

  // future API routes
  .all('/api/*', () => error(404))

  .all('*', originHelix);

export default { ...router };
