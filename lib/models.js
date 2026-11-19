const DEFAULT_BASE_URL = 'https://api.mistral.ai/v1';

export async function listModels({
  env = process.env,
  fetchImpl = globalThis.fetch,
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = 15000
} = {}) {
  const apiKey = typeof env?.MISTRAL_API_KEY === 'string' ? env.MISTRAL_API_KEY.trim() : '';
  if (!apiKey) {
    return {
      status: 'BLOCKED',
      reason: 'MISTRAL_API_KEY environment variable is required to query live models (never read from keyrings or stored)'
    };
  }
  if (typeof fetchImpl !== 'function') {
    return { status: 'BLOCKED', reason: 'Fetch API is unavailable in this Node runtime' };
  }
  const url = `${baseUrl.replace(/\/+$/, '')}/models`;
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    const code = error?.name === 'TimeoutError' ? 'Request timed out' : 'Network request failed';
    return { status: 'BLOCKED', reason: `${code} while querying Mistral models endpoint` };
  }
  if (!response.ok) {
    return {
      status: 'BLOCKED',
      reason: `Mistral models endpoint returned HTTP ${response.status}`
    };
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    return { status: 'BLOCKED', reason: 'Mistral models endpoint returned invalid JSON' };
  }
  const raw = Array.isArray(payload?.data) ? payload.data : null;
  if (!raw) {
    return { status: 'BLOCKED', reason: 'Mistral models endpoint response missing data array' };
  }
  const seen = new Set();
  const models = [];
  for (const item of raw) {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || seen.has(item.id)) continue;
    seen.add(item.id);
    models.push({
      id: item.id,
      ownedBy: typeof item.owned_by === 'string' ? item.owned_by : null,
      maxContextLength: typeof item.max_context_length === 'number' ? item.max_context_length : null
    });
  }
  models.sort((a, b) => a.id.localeCompare(b.id));
  return {
    status: 'DONE',
    source: 'mistral-api',
    count: models.length,
    models
  };
}
