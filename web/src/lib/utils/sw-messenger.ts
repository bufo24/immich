/**
 * Low-level protocol for communicating with the service worker via BroadcastChannel.
 *
 * Protocol:
 * 1. Main thread sends request: { type: string, requestId: string, ...data }
 * 2. SW sends ack: { type: 'ack', requestId: string }
 * 3. SW sends response (optional): { type: 'response', requestId: string, result?: any, error?: string }
 */

interface PendingRequest {
  resolveAck: () => void;
  resolveResponse?: (result: unknown) => void;
  rejectResponse?: (error: Error) => void;
  ackTimeout: ReturnType<typeof setTimeout>;
  ackReceived: boolean;
}

export class ServiceWorkerMessenger {
  readonly #broadcast: BroadcastChannel;
  readonly #pendingRequests = new Map<string, PendingRequest>();
  readonly #ackTimeoutMs: number;
  #requestCounter = 0;
  #onTimeout?: (type: string, data: Record<string, unknown>) => void;

  constructor(channelName: string, ackTimeoutMs = 5000) {
    this.#broadcast = new BroadcastChannel(channelName);
    this.#ackTimeoutMs = ackTimeoutMs;

    this.#broadcast.addEventListener('message', (event) => {
      this.#handleMessage(event.data);
    });
  }

  #handleMessage(data: unknown) {
    if (typeof data !== 'object' || data === null) {
      return;
    }

    const message = data as { requestId?: string; type?: string; error?: string; result?: unknown };
    const requestId = message.requestId;
    if (!requestId) {
      return;
    }

    const pending = this.#pendingRequests.get(requestId);
    if (!pending) {
      return;
    }

    if (message.type === 'ack') {
      pending.ackReceived = true;
      clearTimeout(pending.ackTimeout);
      pending.resolveAck();
      return;
    }

    if (message.type === 'response') {
      clearTimeout(pending.ackTimeout);
      this.#pendingRequests.delete(requestId);

      if (message.error) {
        pending.rejectResponse?.(new Error(message.error));
        return;
      }

      pending.resolveResponse?.(message.result);
    }
  }

  /**
   * Set a callback to be invoked when an ack timeout occurs.
   * This can be used to detect and disable faulty service workers.
   */
  onAckTimeout(callback: (type: string, data: Record<string, unknown>) => void): void {
    this.#onTimeout = callback;
  }

  /**
   * Send a message to the service worker.
   * - send(): waits for ack, resolves when acknowledged
   * - request(): waits for response, throws on error/timeout
   */
  #sendInternal<T>(type: string, data: Record<string, unknown>, waitForResponse: boolean): Promise<T> {
    const requestId = `${type}-${++this.#requestCounter}-${Date.now()}`;

    const promise = new Promise<T>((resolve, reject) => {
      const ackTimeout = setTimeout(() => {
        const pending = this.#pendingRequests.get(requestId);
        if (pending && !pending.ackReceived) {
          this.#pendingRequests.delete(requestId);
          console.warn(`[ServiceWorker] ${type} request not acknowledged:`, data);
          this.#onTimeout?.(type, data);
          // Only reject if we're waiting for a response
          if (waitForResponse) {
            reject(new Error(`Service worker did not acknowledge ${type} request`));
          } else {
            pending.resolveAck();
          }
        }
      }, this.#ackTimeoutMs);

      this.#pendingRequests.set(requestId, {
        resolveAck: waitForResponse ? () => {} : () => resolve(undefined as T),
        resolveResponse: waitForResponse ? (result: unknown) => resolve(result as T) : undefined,
        rejectResponse: waitForResponse ? reject : undefined,
        ackTimeout,
        ackReceived: false,
      });

      this.#broadcast.postMessage({
        type,
        requestId,
        ...data,
      });
    });

    return promise;
  }

  /**
   * Send a one-way message to the service worker.
   * Returns a promise that resolves after the service worker acknowledges receipt.
   * Rejects if no ack is received within the timeout period.
   */
  send(type: string, data: Record<string, unknown>): Promise<void> {
    return this.#sendInternal<void>(type, data, false);
  }

  /**
   * Send a request and wait for ack + response.
   * Returns a promise that resolves with the response data or rejects on error/timeout.
   */
  request<T = void>(type: string, data: Record<string, unknown>): Promise<T> {
    return this.#sendInternal<T>(type, data, true);
  }

  /**
   * Close the broadcast channel
   */
  close(): void {
    this.#broadcast.close();
  }
}
