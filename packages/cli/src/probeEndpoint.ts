const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'teamtrail-connect', version: '1' } },
};

export type ProbeResult = 'ok' | 'unauthorized' | 'host-refused' | 'unreachable' | 'unexpected';

/**
 * Asks a remote MCP endpoint whether it takes this token, by opening a session and ending it at once. The
 * result never carries the response text: an error body is the server's business, not the terminal's.
 */
export async function probeEndpoint(url: string, token: string, timeoutMs = 5000): Promise<ProbeResult> {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json, text/event-stream' };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(INITIALIZE),
      signal: AbortSignal.timeout(timeoutMs),
    });
    // A 403 is read only to tell the server's Host refusal from anything else; its text goes no further.
    const refusal = r.status === 403 ? await r.text().catch(() => '') : '';
    await r.body?.cancel().catch(() => {});
    if (r.status === 401) return 'unauthorized';
    if (/Host not allowed/.test(refusal)) return 'host-refused';
    if (!r.ok) return 'unexpected';
    const session = r.headers.get('mcp-session-id');
    if (session)
      await fetch(url, {
        method: 'DELETE',
        headers: { ...headers, 'Mcp-Session-Id': session },
        signal: AbortSignal.timeout(timeoutMs),
      }).catch(() => {});
    return 'ok';
  } catch {
    return 'unreachable';
  }
}
