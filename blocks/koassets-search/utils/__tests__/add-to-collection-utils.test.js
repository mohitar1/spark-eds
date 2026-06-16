/**
 * Tests for add-to-collection-utils.js
 */

import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import {
  getAddToCollectionOverlayHTML,
  attachAddToCollectionOverlayListener,
} from '../add-to-collection-utils.js';

describe('add-to-collection-utils', () => {
  describe('getAddToCollectionOverlayHTML', () => {
    describe('when asset is NOT a template', () => {
      it('should return overlay HTML for regular asset without template properties', () => {
        const asset = {
          assetId: 'urn:aaid:aem:fff5e78c-a49e-4298-bec2-bf7b68b32aa3',
          name: 'dia_coke_christmas2020_325ml_04aug20_nf_o.jpg',
          title: 'DIA_COKE_CHRISTMAS2020_325ML_04AUG20_NF_O',
        };
        const html = getAddToCollectionOverlayHTML(asset);

        expect(html).toBeTruthy();
        expect(html).toContain('add-to-collection-overlay');
        expect(html).toContain('add-to-collection-content');
        expect(html).toContain('icon add circle');
        expect(html).toContain('Add to Collection');
      });

      it('should return empty HTML when result is passed from search response to template details page', () => {
        const asset = {
          assetId: 'urn:aaid:aem:fff5e78c-a49e-4298-bec2-bf7b68b32aa3',
          name: '62363198_e-mail-corporate-signature-mx-1.xml',
          'tccc-templatePath': '/content/dam/tccc/templates/us/multi-brand/base-templates/2021/62363198_e-mail-corporate-signature-mx-1/62363198_e-mail-corporate-signature-mx-1.xml',
        };
        const html = getAddToCollectionOverlayHTML(asset);

        expect(html).toBe('');
      });

      it('should return empty HTML when result is passed from metadata response to template details page', () => {
        const asset = {
          assetId: 'urn:aaid:aem:fff5e78c-a49e-4298-bec2-bf7b68b32aa3',
          name: '62363198_e-mail-corporate-signature-mx-1.xml',
          templatePath: '/content/dam/tccc/templates/us/multi-brand/base-templates/2021/62363198_e-mail-corporate-signature-mx-1/62363198_e-mail-corporate-signature-mx-1.xml',
        };
        const html = getAddToCollectionOverlayHTML(asset);

        expect(html).toBe('');
      });
    });
  });

  describe('attachAddToCollectionOverlayListener', () => {
    let mockAsset;
    let mockClient;
    let dispatchEventSpy;

    beforeEach(() => {
      // Mock window object for Node environment
      global.window = {
        dispatchEvent: vi.fn(),
      };

      mockAsset = {
        assetId: 'urn:aaid:aem:fff5e78c-a49e-4298-bec2-bf7b68b32aa3',
        name: 'test-asset.jpg',
        repositoryPath: '/content/dam/test/asset.jpg',
      };

      mockClient = {
        getOptimizedDeliveryPreviewUrl: vi.fn((assetId, name, size) => `/api/adobe/assets/${assetId}/as/preview-${name}?width=${size}&preferwebp=true`),
      };

      dispatchEventSpy = vi.spyOn(global.window, 'dispatchEvent');
    });

    afterEach(() => {
      vi.restoreAllMocks();
      delete global.window;
    });

    it('should not throw error when overlay element is empty', () => {
      expect(() => {
        attachAddToCollectionOverlayListener(null, mockAsset, mockClient);
      }).not.toThrow();

      expect(() => {
        attachAddToCollectionOverlayListener(undefined, mockAsset, mockClient);
      }).not.toThrow();
    });

    it('should attach event listener and dispatch event when overlay element is present', () => {
      const mockOverlayElement = {
        addEventListener: vi.fn(),
      };

      attachAddToCollectionOverlayListener(mockOverlayElement, mockAsset, mockClient);

      expect(mockOverlayElement.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));

      const clickHandler = mockOverlayElement.addEventListener.mock.calls[0][1];
      const mockEvent = { stopPropagation: vi.fn() };
      clickHandler(mockEvent);

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'openCollectionModal',
          detail: expect.objectContaining({
            asset: expect.objectContaining({
              assetId: 'urn:aaid:aem:fff5e78c-a49e-4298-bec2-bf7b68b32aa3',
              name: 'test-asset.jpg',
              repositoryPath: '/content/dam/test/asset.jpg',
            }),
            assetPath: '/content/dam/test/asset.jpg',
          }),
        }),
      );
    });
  });
});
