/* Small fetch wrapper: timeout, JSON, retries on network errors and 429/5xx. */
async function request(url, opts = {}, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(opts.timeoutMs || 10000) });
      if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`HTTP ${res.status} from ${url}`), { retry: true });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}: ${(await res.text()).slice(0, 200)}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      const retryable = e.retry || e.name === 'TimeoutError' || e.name === 'TypeError';
      if (!retryable || i === tries - 1) break;
      await new Promise(r => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr;
}
const getJSON = (url, o) => request(url, { method: 'GET', ...o });
const postJSON = (url, body, o) => request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...o });
module.exports = { getJSON, postJSON };
