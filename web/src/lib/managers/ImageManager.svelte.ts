import { getAssetUrlForKind, ImageKinds, type ImageKind } from '$lib/utils';
import { cancelImageUrl, prepareImageUrl } from '$lib/utils/sw-messaging';
import { type AssetResponseDto } from '@immich/sdk';

class ImageManager {
  async preload(asset: AssetResponseDto | undefined, kind: ImageKind = 'preview', suppressError = 'true') {
    if (!asset) {
      return;
    }

    const url = getAssetUrlForKind(asset, kind);
    if (!url) {
      return;
    }

    const promise = this.#executePreloadAndWait(url);
    if (suppressError) {
      return promise.catch(() => void 0);
    }
    return promise;
  }

  async prepareImageUrl(url: string | undefined) {
    if (!url) {
      return;
    }

    return this.#prepareImageUrl(url);
  }

  // Prepare a url for cancelation - call this before requesting an image in order to be able to cancel it
  async #prepareImageUrl(url: string) {
    await prepareImageUrl(url);
  }

  async #executePreloadAndWait(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.addEventListener('load', () => resolve());
      img.addEventListener('error', () => reject(new Error(`Failed to preload image: ${url}`)));
      img.src = url;
    });
  }

  cancel(asset: AssetResponseDto | undefined, kind: ImageKind | 'all' = 'preview') {
    if (!asset) {
      return;
    }

    const kinds = kind === 'all' ? (Object.keys(ImageKinds) as ImageKind[]) : [kind];
    for (const k of kinds) {
      const url = getAssetUrlForKind(asset, k);
      if (url) {
        cancelImageUrl(url);
      }
    }
  }

  cancelPreloadUrl(url: string | undefined) {
    if (url) {
      cancelImageUrl(url);
    }
  }
}

export const imageManager = new ImageManager();
