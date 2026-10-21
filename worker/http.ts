/** JSON answers. */

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  })
}

export function fail(error: string, status = 400): Response {
  return json({ ok: false, error }, status)
}

/** A request the Worker refuses, with the answer to send. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

/** {@return the body as an object, or an HttpError for anything else} */
export function parseObject(raw: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'the body is not JSON')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HttpError(400, 'the body must be a JSON object')
  return parsed as Record<string, unknown>
}

/** Ids Chronos accepts: a-z, 0-9 and _, at most 64 characters. */
export const ID = /^[a-z0-9_]{1,64}$/
