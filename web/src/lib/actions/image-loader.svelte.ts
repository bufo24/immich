import { cancelImageUrl } from '$lib/utils/sw-messaging';
import type { ClassValue } from 'svelte/elements';

import { imageManager } from '$lib/managers/ImageManager.svelte';
/**
 * Converts a ClassValue to a string suitable for className assignment.
 * Handles strings, arrays, and objects similar to how clsx works.
 */
function classValueToString(value: ClassValue | undefined): string {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((v) => classValueToString(v))
      .filter(Boolean)
      .join(' ');
  }
  // Object/dictionary case
  return Object.entries(value)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(' ');
}

export interface ImageLoaderParams {
  src: string | undefined;
  onStart?: () => void;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onElementCreated?: (element: HTMLImageElement) => void;
  imgClass?: ClassValue;
  alt?: string;
  draggable?: boolean;
  role?: string;
  style?: string;
  title?: string | null;
  loading?: 'lazy' | 'eager';
  dataAttributes?: Record<string, string>;
}

/**
 * 1. Creates and appends an <img> element to the parent
 * 2. Coordinates with service worker before src triggers fetch
 * 3. Adds load/error listeners
 * 4. Cancels SW request when element is removed from DOM
 */
export function imageLoader(node: HTMLElement, params: ImageLoaderParams) {
  let currentSrc = params.src;
  let currentCallbacks = params;
  let imgElement: HTMLImageElement | null = null;

  const handleLoad = () => {
    currentCallbacks.onLoad?.();
  };

  const handleError = () => {
    currentCallbacks.onError?.(new Error(`Failed to load image: ${currentSrc}`));
  };

  const updateImageAttributes = (img: HTMLImageElement, params: ImageLoaderParams) => {
    if (params.alt !== undefined) {
      img.alt = params.alt;
    }
    if (params.draggable !== undefined) {
      img.draggable = params.draggable;
    }
    if (params.imgClass) {
      img.className = classValueToString(params.imgClass);
    }
    if (params.role) {
      img.role = params.role;
    }
    if (params.style !== undefined) {
      img.setAttribute('style', params.style);
    }
    if (params.title !== undefined && params.title !== null) {
      img.title = params.title;
    }
    if (params.loading !== undefined) {
      img.loading = params.loading;
    }
    if (params.dataAttributes) {
      for (const [key, value] of Object.entries(params.dataAttributes)) {
        img.setAttribute(key, value);
      }
    }
  };

  const createImageElement = (src: string | undefined, elementParams: ImageLoaderParams) => {
    const img = document.createElement('img');
    updateImageAttributes(img, elementParams);

    img.addEventListener('load', handleLoad);
    img.addEventListener('error', handleError);

    elementParams.onElementCreated?.(img);
    elementParams.onStart?.();

    // Set src once during construction
    if (src) {
      imageManager.prepareImageUrl(src).then(
        () => {
          img.src = src;
          node.append(img);
        },
        (error) => {
          currentCallbacks.onError?.(error);
        },
      );
    } else {
      img.classList.add('hidden');
      node.append(img);
    }

    return img;
  };

  imgElement = createImageElement(currentSrc, params);

  const cleanupImageElement = () => {
    cancelImageUrl(currentSrc);
    if (imgElement) {
      imgElement.removeEventListener('load', handleLoad);
      imgElement.removeEventListener('error', handleError);
      imgElement.remove();
    }
  };

  return {
    update(newParams: ImageLoaderParams) {
      // If src changed, recreate the image element
      if (newParams.src !== currentSrc) {
        cleanupImageElement();

        currentSrc = newParams.src;
        currentCallbacks = newParams;

        imgElement = createImageElement(currentSrc, newParams);
        return;
      }

      currentCallbacks = newParams;

      if (!imgElement) {
        return;
      }

      updateImageAttributes(imgElement, newParams);
    },

    destroy() {
      cleanupImageElement();
    },
  };
}
