import type { ILogStorage } from "../log-storage/types.ts";
import { createSpanHandle } from "./Span.ts";
import type { ISpan, SpanId } from "./types.ts";

/**
 * Creates a local span handle that continues an existing serialized trace relationship.
 *
 * A trace relationship identifies a span, its parent, and the top of its trace after those values have
 * crossed a serialization boundary. Attaching the relationship emits no `span_start` event. Direct logs use
 * the supplied span ID, while new child spans descend from it in the same trace. This API lets a receiver add
 * causally related work without inventing a replacement trace.
 *
 * @param logStorage The local storage that receives logs written through the continued handle.
 * @param spanId The previously serialized relationship to attach to locally.
 * @returns An `ISpan` whose full ID is a clone of `spanId`, whose direct logs use that relationship, and whose
 * children name the supplied ID as their parent.
 *
 * @example
 * const receivedSpanId = SpanIdSchema.parse(request.log_span);
 * const remoteParent = continueTrace(logStorage, receivedSpanId);
 * const received = remoteParent.startSpan('Received at boundary', { method: 'get' });
 * try {
 *     return await collection.get(key, received);
 * } finally {
 *     await received.end();
 * }
 *
 * @remarks
 * `spanId` is cloned into a JSON-safe value as the handle is created, so later mutations of the caller's
 * object cannot change the relationship. The caller is responsible for validating data received from an
 * untrusted or serialized source before calling this function. Do not end a merely attached remote parent;
 * end only spans created and owned by the current process.
 */
export function continueTrace(logStorage: ILogStorage, spanId: SpanId): ISpan {
    return createSpanHandle(logStorage, spanId);
}
