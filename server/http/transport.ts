import type { HttpTransport } from '../contracts.js';
export const transport: HttpTransport = async (url, options) => {
  const signal = AbortSignal.timeout(options.timeoutMs);
  const response = await fetch(url,{headers:options.headers,signal});
  // Deadline includes stalled body reads, not just response headers.
  return {status:response.status,body:Buffer.from(await response.arrayBuffer())};
};
