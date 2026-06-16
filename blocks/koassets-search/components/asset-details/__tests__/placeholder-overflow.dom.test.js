/**
 * DOM tests for #asset-details-image-placeholder overflow fix.
 *
 * Validates that the CSS rules in asset-details.css correctly constrain
 * content for every asset type rendered inside the placeholder:
 *   - Regular images (picture > img)
 *   - Regular videos (poster picture; actual video in sibling container)
 *   - PDFs — rights-free (placeholder hidden) and non-rights-free (thumbnail)
 *   - ZIP + video  (wrapper div with direct <video> child)
 *   - ZIP + image  (wrapper div with direct <img> child)
 *   - ZIP + audio  (wrapper div with nested <audio>)
 */

import {
  describe, it, expect, beforeEach, afterEach,
} from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { renderMediaContent } from '../zip-media-handler.js';

const CSS_PATH = resolve(__dirname, '../../../styles/asset-details.css');

let styleEl;
let container;

function injectCSS() {
  const css = readFileSync(CSS_PATH, 'utf-8');
  styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
}

/**
 * Build the outer DOM skeleton that mirrors renderImageSection() output.
 * Callers populate the placeholder and optionally add sibling containers.
 */
function buildShell({ isPdf = false, isVideo = false } = {}) {
  const sectionClasses = [
    'asset-details-main-image-section',
    isVideo ? 'is-video' : '',
    isPdf ? 'is-pdf' : '',
  ].filter(Boolean).join(' ');

  container = document.createElement('div');
  container.classList.add('asset-details-main-main-section');
  container.style.cssText = 'display:flex; min-height:70vh;';

  container.innerHTML = `
    <div class="${sectionClasses}" style="flex:2; padding:40px;">
      <div class="asset-details-image-wrapper" style="position:relative; width:100%; height:100%; max-width:1000px; max-height:1000px; display:flex; align-items:center; justify-content:center;">
        <div class="asset-details-image-container" style="position:relative; width:100%; height:100%; display:flex; align-items:center; justify-content:center;">
          <div class="asset-details-main-image-placeholder" id="asset-details-image-placeholder"></div>
          ${isPdf ? '<div id="asset-details-pdf-viewer-container" class="asset-details-pdf-viewer-inline"></div>' : ''}
          ${isVideo ? '<div class="video-player-container" id="asset-details-video-player"></div>' : ''}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(container);
  return container.querySelector('#asset-details-image-placeholder');
}

function getPlaceholder() {
  return document.getElementById('asset-details-image-placeholder');
}

beforeEach(() => {
  injectCSS();
});

afterEach(() => {
  styleEl?.remove();
  container?.remove();
  styleEl = null;
  container = null;
});

// ---------------------------------------------------------------------------
// Helpers to simulate each asset type's DOM insertion
// ---------------------------------------------------------------------------

function insertRegularImage(placeholder) {
  const picture = document.createElement('picture');
  picture.dataset.assetId = 'urn:aaid:aem:test-image';
  const img = document.createElement('img');
  img.className = 'asset-details-main-image';
  picture.appendChild(img);
  placeholder.appendChild(picture);
  return { picture, img };
}

function insertZipVideo(placeholder) {
  const wrapper = document.createElement('div');
  wrapper.dataset.assetId = 'urn:aaid:aem:test-zip-video';
  wrapper.innerHTML = `
    <video class="ui centered image cmp-image"
           style="width: 100%; height: 100%; object-fit: contain;"
           autoplay muted loop controls controlsList="nodownload">
      <source src="/api/adobe/assets/test/renditions/Watermark-Video.mp4/as/Watermark-Video.mp4" type="video/webm"/>
      <source src="/api/adobe/assets/test/renditions/Watermark-Video.mp4/as/Watermark-Video.mp4" type="video/mp4"/>
    </video>
  `;
  placeholder.appendChild(wrapper);
  return { wrapper, video: wrapper.querySelector('video') };
}

function insertZipImage(placeholder) {
  const wrapper = document.createElement('div');
  wrapper.dataset.assetId = 'urn:aaid:aem:test-zip-image';
  wrapper.innerHTML = `
    <img class="ui centered image cmp-image cmp-details-image__image"
         src="/api/adobe/assets/test/renditions/cq5dam.web.1280.1280/as/cq5dam.web.1280.1280"
         alt="zip-file-img"
         style="width: 100%; height: 100%; object-fit: contain;"/>
  `;
  placeholder.appendChild(wrapper);
  return { wrapper, img: wrapper.querySelector('img') };
}

function insertZipAudio(placeholder) {
  const wrapper = document.createElement('div');
  wrapper.dataset.assetId = 'urn:aaid:aem:test-zip-audio';
  wrapper.innerHTML = `
    <div class="audio-container" style="display: flex; justify-content: center; align-items: center; width: 100%; height: 100%;">
      <audio controls controlsList="nodownload">
        <source src="/api/adobe/assets/test/renditions/audio.mp3/as/audio.mp3" type="audio/mpeg">
      </audio>
    </div>
  `;
  placeholder.appendChild(wrapper);
  return { wrapper, audio: wrapper.querySelector('audio') };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Asset details placeholder overflow CSS', () => {
  describe('placeholder base rules', () => {
    it('has overflow:hidden on #asset-details-image-placeholder', () => {
      const placeholder = buildShell();
      const style = getComputedStyle(placeholder);
      expect(style.overflow).toBe('hidden');
    });

    it('has width and height 100%', () => {
      const placeholder = buildShell();
      const style = getComputedStyle(placeholder);
      expect(style.width).toBe('100%');
      expect(style.height).toBe('100%');
    });
  });

  describe('regular image (non-ZIP)', () => {
    it('direct child is <picture>, not <div>', () => {
      const placeholder = buildShell();
      insertRegularImage(placeholder);
      expect(placeholder.firstElementChild.tagName).toBe('PICTURE');
    });

    it('img has max-height 900px from CSS', () => {
      const placeholder = buildShell();
      const { img } = insertRegularImage(placeholder);
      const style = getComputedStyle(img);
      expect(style.maxHeight).toBe('900px');
    });
  });

  describe('regular video', () => {
    it('poster <picture> is in placeholder; video container is a sibling', () => {
      const placeholder = buildShell({ isVideo: true });
      insertRegularImage(placeholder);

      expect(placeholder.firstElementChild.tagName).toBe('PICTURE');

      const videoContainer = container.querySelector('.video-player-container');
      expect(videoContainer).toBeTruthy();
      expect(videoContainer.parentElement.id).not.toBe('asset-details-image-placeholder');
      expect(videoContainer.closest('.asset-details-image-container')).toBeTruthy();
    });
  });

  describe('PDF (rights-free)', () => {
    it('placeholder is display:none when section has .is-pdf', () => {
      buildShell({ isPdf: true });
      const placeholder = getPlaceholder();
      const style = getComputedStyle(placeholder);
      expect(style.display).toBe('none');
    });
  });

  describe('PDF (non-rights-free)', () => {
    it('behaves like a regular image (picture child)', () => {
      const placeholder = buildShell();
      const { img } = insertRegularImage(placeholder);
      expect(placeholder.firstElementChild.tagName).toBe('PICTURE');
      expect(getComputedStyle(img).maxHeight).toBe('900px');
    });
  });

  describe('ZIP + video rendition', () => {
    it('wrapper div with <video> child gets width/height 100% via :has(> video)', () => {
      const placeholder = buildShell();
      const { wrapper } = insertZipVideo(placeholder);
      const style = getComputedStyle(wrapper);
      expect(style.width).toBe('100%');
      expect(style.height).toBe('100%');
    });

    it('video element exists as direct child of wrapper', () => {
      const placeholder = buildShell();
      const { wrapper, video } = insertZipVideo(placeholder);
      expect(video.parentElement).toBe(wrapper);
      expect(video.tagName).toBe('VIDEO');
    });

    it('video has autoplay, muted, and loop attributes', () => {
      const placeholder = buildShell();
      const { video } = insertZipVideo(placeholder);
      expect(video.hasAttribute('autoplay')).toBe(true);
      expect(video.hasAttribute('muted')).toBe(true);
      expect(video.hasAttribute('loop')).toBe(true);
    });

    it('renderMediaContent produces autoplay muted loop for video type', () => {
      const rendition = { name: 'Watermark-Video.mp4', format: 'video/mp4' };
      const asset = { assetId: 'urn:aaid:aem:test' };
      const html = renderMediaContent(rendition, 'video', asset);
      expect(html).toContain('autoplay');
      expect(html).toContain('muted');
      expect(html).toContain('loop');
    });

    it('renderMediaContent produces autoplay muted loop for video with height', () => {
      const rendition = { name: 'Watermark-Video.mp4', format: 'video/mp4' };
      const asset = { assetId: 'urn:aaid:aem:test' };
      const html = renderMediaContent(rendition, 'video', asset, { videoHeight: 720 });
      expect(html).toContain('autoplay');
      expect(html).toContain('muted');
      expect(html).toContain('loop');
    });
  });

  describe('ZIP + image rendition', () => {
    it('wrapper div does NOT get height:100% (no :has(> video) match)', () => {
      const placeholder = buildShell();
      const { wrapper } = insertZipImage(placeholder);
      const style = getComputedStyle(wrapper);
      // Should NOT have height:100% forced by the :has(> video) rule
      expect(style.height).not.toBe('100%');
    });

    it('img inside wrapper still gets max-height:900px', () => {
      const placeholder = buildShell();
      const { img } = insertZipImage(placeholder);
      const style = getComputedStyle(img);
      expect(style.maxHeight).toBe('900px');
    });
  });

  describe('ZIP + audio rendition', () => {
    it('wrapper div does NOT get height:100% (no :has(> video) match)', () => {
      const placeholder = buildShell();
      const { wrapper } = insertZipAudio(placeholder);
      const style = getComputedStyle(wrapper);
      expect(style.height).not.toBe('100%');
    });

    it('audio element is nested (not direct child of wrapper)', () => {
      const placeholder = buildShell();
      const { wrapper, audio } = insertZipAudio(placeholder);
      expect(audio.parentElement).not.toBe(wrapper);
      expect(audio.parentElement.classList.contains('audio-container')).toBe(true);
    });
  });
});
