/** A form POST that asks for JSON back, as GitHub's OAuth endpoints expect. */
export function deviceRequest(params: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  };
}
