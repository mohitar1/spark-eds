import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { originPublishPassthrough, originPublishChili, originPublish } from '../publish.js';

vi.mock('../dm-analytics.js', () => ({
  HEADER_ANALYTICS_CONTEXT: 'x-analytics-context',
  handleTemplateDownloadAnalytics: vi.fn(),
}));

describe('originPublishPassthrough', () => {
  let env;

  beforeEach(() => {
    env = { AEM_ENV_ID: 'p111-e222' };
    vi.stubGlobal('fetch', vi.fn(() => new Response('ok')));
  });

  it('should proxy to AEM publish host', async () => {
    const request = new Request(
      'https://assets.coke.com/public/download/original/asset.zip',
    );
    await originPublishPassthrough(request, env);

    const [url] = fetch.mock.calls[0];
    expect(url.hostname).toBe('publish-p111-e222.adobeaemcloud.com');
    expect(url.pathname).toBe('/public/download/original/asset.zip');
    expect(url.protocol).toBe('https:');
    expect(url.port).toBe('');
  });

  it('should not send cookies', async () => {
    const request = new Request(
      'https://assets.coke.com/public/download/original/asset.zip',
      { headers: { cookie: 'session=abc' } },
    );
    await originPublishPassthrough(request, env);

    const { headers } = fetch.mock.calls[0][1];
    expect(headers.has('cookie')).toBe(false);
  });

  it('should forward the request method', async () => {
    const request = new Request(
      'https://assets.coke.com/public/download/original/asset.zip',
      { method: 'GET' },
    );
    await originPublishPassthrough(request, env);

    expect(fetch.mock.calls[0][1].method).toBe('GET');
  });

  it('should forward POST body', async () => {
    const samlBody = 'SAMLResponse=PHNhbWxwOl&RelayState=/content/share';
    const request = new Request(
      'https://assets.coke.com/content/share/saml_login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: samlBody,
      },
    );
    await originPublishPassthrough(request, env);

    const [url, opts] = fetch.mock.calls[0];
    expect(url.pathname).toBe('/content/share/saml_login');
    expect(opts.method).toBe('POST');
    const forwarded = new TextDecoder().decode(opts.body);
    expect(forwarded).toBe(samlBody);
  });

  it('should return empty 404 when AEM returns 404', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Response('<html>AEM error</html>', { status: 404 })));
    const request = new Request(
      'https://assets.coke.com/public/download/original/missing.zip',
    );
    const response = await originPublishPassthrough(request, env);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });

  it('should pass through non-404 responses unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Response('file-content', {
      status: 200,
      headers: { 'content-type': 'application/zip' },
    })));
    const request = new Request(
      'https://assets.coke.com/public/download/original/asset.zip',
    );
    const response = await originPublishPassthrough(request, env);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('file-content');
  });
});

describe('originPublishChili', () => {
  let env;

  beforeEach(() => {
    env = { AEM_ENV_ID: 'p111-e222' };
    vi.stubGlobal('fetch', vi.fn(() => new Response('ok')));
  });

  it('should fall through when no authorization header', async () => {
    const request = new Request('https://assets.coke.com/content/dam/asset.jpg');
    const result = await originPublishChili(request, env);
    expect(result).toBeUndefined();
  });

  it('should fall through for non-Basic auth', async () => {
    const request = new Request('https://assets.coke.com/content/dam/asset.jpg', {
      headers: { authorization: 'Bearer token123' },
    });
    const result = await originPublishChili(request, env);
    expect(result).toBeUndefined();
  });

  it('should fall through and log for wrong username', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const request = new Request('https://assets.coke.com/content/dam/asset.jpg', {
      headers: { authorization: `Basic ${btoa('other-user:pass')}` },
    });
    const result = await originPublishChili(request, env);
    expect(result).toBeUndefined();
    expect(spy).toHaveBeenCalledWith('[Chili] Basic Auth request from username: other-user');
    spy.mockRestore();
  });

  it('should fall through for malformed base64', async () => {
    const request = new Request('https://assets.coke.com/content/dam/asset.jpg', {
      headers: { authorization: 'Basic !!!not-base64!!!' },
    });
    const result = await originPublishChili(request, env);
    expect(result).toBeUndefined();
  });

  it('should proxy to AEM publish with incoming auth header', async () => {
    const authHeader = `Basic ${btoa('chili-frame-api-user:secret')}`;
    const request = new Request('https://assets.coke.com/content/dam/asset.jpg', {
      headers: { authorization: authHeader },
    });
    await originPublishChili(request, env);

    const [url, opts] = fetch.mock.calls[0];
    expect(url.hostname).toBe('publish-p111-e222.adobeaemcloud.com');
    expect(url.pathname).toBe('/content/dam/asset.jpg');
    expect(opts.headers.get('authorization')).toBe(authHeader);
  });

  it('should proxy for test-chili-proxy-tmp username', async () => {
    const authHeader = `Basic ${btoa('test-chili-proxy-tmp:secret')}`;
    const request = new Request('https://assets.coke.com/content/dam/asset.jpg', {
      headers: { authorization: authHeader },
    });
    await originPublishChili(request, env);

    const [url, opts] = fetch.mock.calls[0];
    expect(url.hostname).toBe('publish-p111-e222.adobeaemcloud.com');
    expect(opts.headers.get('authorization')).toBe(authHeader);
  });

  it('should not set sling.sudo cookie', async () => {
    const request = new Request('https://assets.coke.com/content/dam/asset.jpg', {
      headers: { authorization: `Basic ${btoa('chili-frame-api-user:secret')}` },
    });
    await originPublishChili(request, env);

    const { headers } = fetch.mock.calls[0][1];
    expect(headers.has('cookie')).toBe(false);
  });

  it('should return empty 404 when AEM returns 404', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Response('not found', { status: 404 })));
    const request = new Request('https://assets.coke.com/content/dam/missing.jpg', {
      headers: { authorization: `Basic ${btoa('chili-frame-api-user:secret')}` },
    });
    const response = await originPublishChili(request, env);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });
});

describe('originPublish – proxy behavior', () => {
  let env;

  beforeEach(() => {
    env = {
      AEM_ENV_ID: 'p111-e222',
      PUBLISH_API_USER: { get: vi.fn(() => 'user:pass') },
    };
    vi.stubGlobal('fetch', vi.fn(() => new Response('ok')));
  });

  function makeRequest(pathname) {
    const request = new Request(`https://assets.coke.com${pathname}`);
    request.user = { email: 'test@coke.com' };
    request.cookies = {};
    return request;
  }

  it('should return empty 404 when AEM returns 404 with HTML body', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Response('<html>AEM error</html>', {
      status: 404,
      headers: { 'content-type': 'text/html' },
    })));
    const request = makeRequest('/content/share/us/en/some-page.html');
    const response = await originPublish(request, env, {});

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });

  it('should pass through non-HTML 404 responses', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Response('{"error":"not found"}', {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })));
    const request = makeRequest('/bin/tccc/some-api');
    const response = await originPublish(request, env, {});

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('{"error":"not found"}');
  });

  it('should proxy to AEM publish host with impersonation', async () => {
    const request = makeRequest('/content/share/us/en/search-assets.updatecollection.json');
    await originPublish(request, env, {});

    const [url, opts] = fetch.mock.calls[0];
    expect(url.hostname).toBe('publish-p111-e222.adobeaemcloud.com');
    expect(opts.headers.get('authorization')).toMatch(/^Basic /);
    expect(opts.headers.get('cookie')).toContain('sling.sudo=test@coke.com');
  });
});
