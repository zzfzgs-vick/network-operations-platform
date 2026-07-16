import {
  createErrorResponse,
  ERROR_DEFINITIONS,
  errorCodeForHttpStatus,
  type ErrorResponse,
  type FieldError,
  type RequestId,
} from "@nop/contracts";
import {
  BadRequestException,
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
  HttpException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { IncomingMessage } from "node:http";

import { AuthorizationDeniedError } from "../modules/identity-access/public.js";
import { requestIdFrom } from "./request-id.js";

const safeFieldPattern = /^[A-Za-z0-9_.[\]-]{1,128}$/;

function safeFieldErrors(
  fieldErrors: ReadonlyArray<FieldError>,
): ReadonlyArray<FieldError> {
  return fieldErrors.slice(0, 32).map(({ field }) => ({
    field: safeFieldPattern.test(field) ? field : "request",
    message: "Invalid value",
  }));
}

export class ContractValidationException extends BadRequestException {
  constructor(readonly fieldErrors: ReadonlyArray<FieldError>) {
    super();
  }
}

export function mapHttpError(
  exception: unknown,
  requestId: RequestId,
): { readonly status: number; readonly body: ErrorResponse } {
  const sourceStatus =
    exception instanceof HttpException
      ? exception.getStatus()
      : exception instanceof AuthorizationDeniedError
        ? 403
        : 500;
  const code = errorCodeForHttpStatus(sourceStatus);
  const definition = ERROR_DEFINITIONS[code];
  const fieldErrors =
    exception instanceof ContractValidationException
      ? safeFieldErrors(exception.fieldErrors)
      : undefined;
  const body = fieldErrors
    ? createErrorResponse({ code, requestId, fieldErrors })
    : createErrorResponse({ code, requestId });

  return {
    status: definition.httpStatus,
    body,
  };
}

@Catch()
@Injectable()
export class ContractExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ContractExceptionFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<IncomingMessage>();
    const response = http.getResponse<unknown>();
    const requestId = requestIdFrom(request);
    const mapped = mapHttpError(exception, requestId);

    this.adapterHost.httpAdapter.setHeader(response, "X-Request-ID", requestId);

    if (mapped.status >= 500) {
      const errorType =
        exception instanceof Error
          ? exception.constructor.name
          : typeof exception;
      this.logger.error(
        `Unhandled HTTP error requestId=${requestId} errorType=${errorType}`,
      );
    }

    this.adapterHost.httpAdapter.reply(response, mapped.body, mapped.status);
  }
}
