import { isValidRequestId, type RequestId } from "@nop/contracts";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const requestIdKey: unique symbol = Symbol("requestId");
type RequestWithId = IncomingMessage & { [requestIdKey]?: RequestId };

export function requestIdFrom(request: IncomingMessage): RequestId {
  const requestWithId = request as RequestWithId;
  const rawHeader = request.headers["x-request-id"];
  const candidate = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const requestId =
    requestWithId[requestIdKey] ??
    (isValidRequestId(candidate) ? candidate : randomUUID());
  requestWithId[requestIdKey] = requestId;
  return requestId;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(
    request: RequestWithId,
    response: ServerResponse,
    next: () => void,
  ): void {
    const rawHeader = request.headers["x-request-id"];
    const candidate = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const requestId = isValidRequestId(candidate) ? candidate : randomUUID();

    request[requestIdKey] = requestId;
    response.setHeader("X-Request-ID", requestId);
    next();
  }
}
