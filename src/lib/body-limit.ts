/*
 * Request body size checks for the public ingest routes, which anyone can post to.
 *
 * A declared Content-Length is trusted (the HTTP server never delivers more than it declares).
 * Without one (chunked uploads), the body is read from a clone only until it passes the limit,
 * so an oversized upload is refused without being buffered whole.
 */

/** The body's size in bytes, counting no further than just past `maxBytes`; null if unreadable. */
export async function measureBody(request: Request, maxBytes: number): Promise<number | null> {
  const declared = request.headers.get('content-length');

  if (declared !== null && declared.trim() !== '') {
    const size = Number(declared);

    if (Number.isFinite(size) && size >= 0) {
      return size;
    }
  }

  if (!request.body) {
    return 0;
  }

  try {
    const reader = request.clone().body!.getReader();
    let size = 0;

    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        return size;
      }

      size += value.byteLength;

      if (size > maxBytes) {
        // Not awaited: cancelling one branch of a cloned (teed) body only settles once the
        // other branch is cancelled too, and the caller refuses the request without reading it.
        reader.cancel().catch(() => {});
        return size;
      }
    }
  } catch {
    return null;
  }
}

/** Whether the body is larger than `maxBytes`. */
export async function isBodyTooLarge(request: Request, maxBytes: number) {
  const size = await measureBody(request, maxBytes);

  return size !== null && size > maxBytes;
}
