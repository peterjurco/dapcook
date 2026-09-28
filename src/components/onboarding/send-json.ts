/** Sends a JSON request and reports only whether it succeeded. */
export async function sendJson(method: 'PATCH' | 'POST', url: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}
