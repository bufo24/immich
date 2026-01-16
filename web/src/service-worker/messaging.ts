import { handleCancel, handlePrepare } from './request';

const sw = globalThis as unknown as ServiceWorkerGlobalScope;

/**
 * Send acknowledgment for a request
 */
function sendAck(client: Client, requestId: string) {
  client.postMessage({
    type: 'ack',
    requestId,
  });
}

/**
 * Handle 'prepare' request: prepare SW to track this request for cancelation
 */
const handlePrepareRequest = (client: Client, url: URL, requestId: string) => {
  sendAck(client, requestId);
  handlePrepare(url);
};

/**
 * Handle 'cancel' request: cancel a pending request
 */
const handleCancelRequest = (client: Client, url: URL, requestId: string) => {
  sendAck(client, requestId);
  handleCancel(url);
};

export const installMessageListener = () => {
  sw.addEventListener('message', (event) => {
    if (!event.data?.requestId) {
      return;
    }

    const requestId = event.data.requestId;
    const url = event.data.url ? new URL(event.data.url, self.location.origin) : undefined;
    if (!url) {
      return;
    }

    const client = event.source as Client;
    if (!client) {
      return;
    }

    switch (event.data.type) {
      case 'prepare': {
        handlePrepareRequest(client, url, requestId);
        break;
      }

      case 'cancel': {
        handleCancelRequest(client, url, requestId);
        break;
      }
    }
  });
};
