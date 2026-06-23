import {
  describe, it, expect, vi, afterEach,
} from 'vitest';

// chart-loader injects <script> tags; mock it so we can assert the denied
// branch returns before any chart bootstrap happens.
const { loadChartJs } = vi.hoisted(() => ({ loadChartJs: vi.fn(() => Promise.resolve()) }));
vi.mock('../../../scripts/audit/chart-loader.js', () => ({ default: loadChartJs }));

const { default: decorate } = await import('../report-asset-activity.js');

describe('report-asset-activity decorate — access gating', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the access-denied notice and skips chart init without view-audit', async () => {
    vi.stubGlobal('window', { user: { permissions: ['something-else'] } });
    const block = { innerHTML: '' };

    await decorate(block);

    expect(block.innerHTML).toContain('aar-denied');
    expect(loadChartJs).not.toHaveBeenCalled();
  });

  it('renders the access-denied notice when there is no user', async () => {
    vi.stubGlobal('window', {});
    const block = { innerHTML: '' };

    await decorate(block);

    expect(block.innerHTML).toContain('aar-denied');
    expect(loadChartJs).not.toHaveBeenCalled();
  });
});
