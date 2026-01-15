type PendingRequest = {
  controller: AbortController;
  promise: Promise<Response>;
  canceled: boolean;
  canceledAt?: number; // Timestamp when cancellation occurred
  fetchStartedAt?: number; // Timestamp when fetch body)
};

const pendingRequests = new Map<string, PendingRequest>();

const getRequestKey = (request: URL | Request): string => (request instanceof URL ? request.href : request.url);

const CANCELED_MESSAGE = 'Canceled - this is normal';

/**
 * Clean up old requests after a timeout
 */
const CANCELATION_EXPIRED_TIMEOUT_MS = 60_000;
const FETCH_EXPIRED_TIMEOUT_MS = 60_000;

const cleanupOldRequests = () => {
  const now = Date.now();
  const keysToDelete: string[] = [];

  for (const [key, request] of pendingRequests.entries()) {
    if (request.canceled && request.canceledAt) {
      const age = now - request.canceledAt;
      if (age > CANCELATION_EXPIRED_TIMEOUT_MS) {
        keysToDelete.push(key);
      }
      continue;
    }

    // Clean up completed requests after 5s (allows time for potential cancellations)
    if (request.fetchStartedAt) {
      const age = now - request.fetchStartedAt;
      if (age > FETCH_EXPIRED_TIMEOUT_MS) {
        keysToDelete.push(key);
      }
    }
  }

  for (const key of keysToDelete) {
    pendingRequests.delete(key);
  }
};

/**
 * Get existing request and cleanup old requests
 */
const getExisting = (requestKey: string): PendingRequest | undefined => {
  cleanupOldRequests();
  return pendingRequests.get(requestKey);
};

// Mark this URL as prepared - actual fetch will happen when handleFetch is called
export const handlePrepare = async (request: URL | Request) => {
  const requestKey = getRequestKey(request);
  const existing = getExisting(requestKey);

  if (existing?.canceled) {
    // Prepare overrides cancel - reset the canceled request
    pendingRequests.delete(requestKey);
  }
};

export const handleFetch = (request: URL | Request): Promise<Response> => {
  const requestKey = getRequestKey(request);
  const existing = getExisting(requestKey);

  if (existing) {
    if (existing.canceled) {
      return Promise.resolve(new Response(undefined, { status: 204 }));
    }
    // Clone the response from the shared promise to avoid "Response is disturbed or locked" errors
    return existing.promise.then((response) => response.clone());
  }

  // No existing request, create a new one
  const controller = new AbortController();
  const promise = fetch(request, { signal: controller.signal }).catch((error: unknown) => {
    const standardError = error instanceof Error ? error : new Error(String(error));
    if (standardError.name === 'AbortError' || standardError.message === CANCELED_MESSAGE) {
      // dummy response avoids network errors in the console for these requests
      return new Response(undefined, { status: 204 });
    }
    throw standardError;
  });

  pendingRequests.set(requestKey, {
    controller,
    promise,
    canceled: false,
    fetchStartedAt: Date.now(),
  });

  // Clone for the first caller, so the promise retains the unconsumed original response for future callers
  return promise.then((response) => response.clone());
};

export const handleCancel = (url: URL) => {
  const requestKey = getRequestKey(url);

  const pendingRequest = pendingRequests.get(requestKey);
  if (pendingRequest) {
    // Mark existing request as canceled with timestamp
    pendingRequest.canceled = true;
    pendingRequest.canceledAt = Date.now();
    pendingRequest.controller.abort(CANCELED_MESSAGE);
  } else {
    // No pending request - create a pre-canceled placeholder
    const controller = new AbortController();
    controller.abort(CANCELED_MESSAGE);

    const preCanceledRequest: PendingRequest = {
      controller,
      promise: Promise.resolve(new Response(undefined, { status: 204 })),
      canceled: true,
      canceledAt: Date.now(),
    };

    pendingRequests.set(requestKey, preCanceledRequest);
  }
};
