import { imageManager } from '$lib/managers/ImageManager.svelte';
import { getAssetUrl, getAssetUrlForKind } from '$lib/utils';
import { type AssetResponseDto, type SharedLinkResponseDto } from '@immich/sdk';

/**
 * Quality levels for progressive image loading
 */
type ImageQuality =
  | 'basic'
  | 'loading-thumbnail'
  | 'thumbnail'
  | 'loading-preview'
  | 'preview'
  | 'loading-original'
  | 'original';

export interface ImageLoaderState {
  previewUrl?: string;
  thumbnailUrl?: string;
  originalUrl?: string;
  quality: ImageQuality;
  hasError: boolean;
}
enum ImageStatus {
  Unloaded = 'Unloaded',
  Success = 'Success',
  Error = 'Error',
}

/**
 * Coordinates adaptive loading of a single asset image:
 * thumbhash → thumbnail → preview → original (on zoom)
 *
 */
export class AdaptiveImageLoader {
  private state = $state<ImageLoaderState>({
    quality: 'basic',
    hasError: false,
    thumbnailUrl: undefined,
  });

  private readonly currentZoomFn: () => number;
  private readonly onImageReady?: () => void;
  private readonly onError?: () => void;
  private readonly onSourceUpdate?: (url: string) => void;
  private readonly thumbnailUrl: string;
  private readonly previewUrl: string | undefined;
  private readonly originalUrl: string | undefined;
  private thumbnailImage = ImageStatus.Unloaded;
  private previewImage = ImageStatus.Unloaded;
  private originalImage = ImageStatus.Unloaded;

  constructor(
    asset: AssetResponseDto,
    sharedLink: SharedLinkResponseDto | undefined,
    callbacks: {
      currentZoomFn: () => number;
      onImageReady?: () => void;
      onError?: () => void;
      onSourceUpdate?: (url: string) => void;
    },
  ) {
    this.currentZoomFn = callbacks.currentZoomFn;
    this.onImageReady = callbacks.onImageReady;
    this.onError = callbacks.onError;
    this.onSourceUpdate = callbacks.onSourceUpdate;

    this.thumbnailUrl = getAssetUrlForKind(asset, 'thumbnail');
    this.previewUrl = getAssetUrl({ asset, sharedLink });
    this.originalUrl = getAssetUrl({ asset, sharedLink, forceOriginal: true });
    this.state.thumbnailUrl = this.thumbnailUrl;
  }

  get adaptiveLoaderState(): ImageLoaderState {
    return this.state;
  }

  onThumbnailStart() {
    this.state.quality = 'loading-thumbnail';
  }

  onThumbnailLoad() {
    this.state.quality = 'thumbnail';
    this.thumbnailImage = ImageStatus.Success;
    this.onImageReady?.();
    this.onSourceUpdate?.(this.thumbnailUrl);
    this.triggerMainImage();
  }

  onThumbnailError() {
    this.state.thumbnailUrl = undefined;
    this.thumbnailImage = ImageStatus.Error;
    this.triggerMainImage();
  }

  triggerMainImage() {
    const wantsOriginal = this.currentZoomFn?.() > 1;
    return wantsOriginal ? this.triggerOriginal() : this.triggerPreview();
  }

  triggerPreview() {
    if (!this.previewUrl) {
      // no preview, try original?
      this.triggerOriginal();
      return false;
    }
    this.state.previewUrl = this.previewUrl;
  }

  onPreviewStart() {
    this.state.quality = 'loading-preview';
  }

  onPreviewLoad() {
    this.state.quality = 'preview';
    this.previewImage = ImageStatus.Success;
    this.onImageReady?.();
    this.onSourceUpdate?.(this.previewUrl!);
  }

  onPreviewError() {
    this.previewImage = ImageStatus.Error;
    this.state.previewUrl = undefined;
    // TODO: maybe try original, but only if preview's error isnt due to cancelation
  }

  triggerOriginal() {
    if (!this.originalUrl) {
      this.onError?.();
      return false;
    }
    this.state.originalUrl = this.originalUrl;
  }

  onOriginalStart() {
    this.state.quality = 'loading-original';
  }

  onOriginalLoad() {
    this.state.quality = 'original';
    this.originalImage = ImageStatus.Success;
    this.onImageReady?.();
    this.onSourceUpdate?.(this.originalUrl!);
  }

  onOriginalError() {
    this.originalImage = ImageStatus.Error;
    this.state.originalUrl = undefined;
  }

  destroy(): void {
    imageManager.cancelPreloadUrl(this.thumbnailUrl);
    imageManager.cancelPreloadUrl(this.previewUrl);
    imageManager.cancelPreloadUrl(this.originalUrl);
  }
}
