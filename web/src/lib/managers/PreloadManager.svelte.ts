import { getAssetUrl } from '$lib/utils';
import { cancelImageUrl, prepareImageUrl } from '$lib/utils/sw-messaging';
import { type AssetResponseDto } from '@immich/sdk';

class PreloadManager {
  async preload(asset: AssetResponseDto | undefined) {
    if (!asset) {
      return;
    }
    const url = getAssetUrl({ asset });
    if (!url) {
      return;
    }

    // Prepare the URL with the service worker for cancellation tracking
    await prepareImageUrl(url);

    // Create an img element to trigger browser fetch (kept in memory, not added to DOM)
    const img = new Image();
    img.src = url;
  }

  cancel(asset: AssetResponseDto | undefined) {
    if (!globalThis.isSecureContext || !asset) {
      return;
    }
    const url = getAssetUrl({ asset });
    cancelImageUrl(url);
  }

  cancelPreloadUrl(url: string | undefined) {
    if (!globalThis.isSecureContext) {
      return;
    }
    cancelImageUrl(url);
  }
}

export const preloadManager = new PreloadManager();
