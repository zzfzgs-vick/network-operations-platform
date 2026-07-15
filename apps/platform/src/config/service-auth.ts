import {
  CanActivate,
  Global,
  Injectable,
  Module,
  SetMetadata,
  UnauthorizedException,
  type ExecutionContext,
} from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

import {
  readOptionalSecret,
  readSecret,
  runtimeEnvironment,
  type Environment,
  type SecretFileReader,
  type SecretValue,
} from "./public.js";

export type InternalService = "collector" | "vmalert";
export type ServiceCapability =
  "observation.ingest" | "metric-condition.ingest";
export type AuthenticationFailureReason =
  "missing" | "invalid" | "service_mismatch" | "configuration_error";

interface ServiceCredentialConfiguration {
  readonly service: InternalService;
  readonly capabilities: ReadonlySet<ServiceCapability>;
  readonly current: SecretValue;
  readonly previous: SecretValue | undefined;
}

export interface ServiceAuthenticationConfiguration {
  readonly credentials: readonly ServiceCredentialConfiguration[];
}

export interface ServicePrincipal {
  readonly kind: "internal-service";
  readonly service: InternalService;
  readonly capability: ServiceCapability;
}

const serviceTokenPattern = /^[A-Za-z0-9._~-]{32,512}$/;

function readServiceToken(
  environment: Environment,
  name: string,
  fileReader?: SecretFileReader,
): SecretValue {
  const token = readSecret(environment, name, fileReader);
  if (!serviceTokenPattern.test(token.reveal())) {
    throw new Error(`${name} must be a bounded opaque token`);
  }
  return token;
}

function readOptionalServiceToken(
  environment: Environment,
  name: string,
  fileReader?: SecretFileReader,
): SecretValue | undefined {
  const token = readOptionalSecret(environment, name, fileReader);
  if (token && !serviceTokenPattern.test(token.reveal())) {
    throw new Error(`${name} must be a bounded opaque token`);
  }
  return token;
}

export function readServiceAuthenticationConfig(
  environment: Environment = process.env,
  fileReader?: SecretFileReader,
): ServiceAuthenticationConfiguration {
  return {
    credentials: [
      {
        service: "collector",
        capabilities: new Set<ServiceCapability>(["observation.ingest"]),
        current: readServiceToken(
          environment,
          "COLLECTOR_SERVICE_TOKEN",
          fileReader,
        ),
        previous: readOptionalServiceToken(
          environment,
          "COLLECTOR_SERVICE_PREVIOUS_TOKEN",
          fileReader,
        ),
      },
      {
        service: "vmalert",
        capabilities: new Set<ServiceCapability>(["metric-condition.ingest"]),
        current: readServiceToken(
          environment,
          "VMALERT_SERVICE_TOKEN",
          fileReader,
        ),
        previous: readOptionalServiceToken(
          environment,
          "VMALERT_SERVICE_PREVIOUS_TOKEN",
          fileReader,
        ),
      },
    ],
  };
}

function runtimeServiceAuthenticationConfig(
  environment: Environment = process.env,
): ServiceAuthenticationConfiguration {
  const configured = [
    "COLLECTOR_SERVICE_TOKEN",
    "COLLECTOR_SERVICE_TOKEN_FILE",
    "COLLECTOR_SERVICE_PREVIOUS_TOKEN",
    "COLLECTOR_SERVICE_PREVIOUS_TOKEN_FILE",
    "VMALERT_SERVICE_TOKEN",
    "VMALERT_SERVICE_TOKEN_FILE",
    "VMALERT_SERVICE_PREVIOUS_TOKEN",
    "VMALERT_SERVICE_PREVIOUS_TOKEN_FILE",
  ].some((name) => environment[name] !== undefined);
  if (!configured && runtimeEnvironment(environment) !== "production") {
    return { credentials: [] };
  }
  return readServiceAuthenticationConfig(environment);
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

class ServiceAuthenticationError extends Error {
  constructor(readonly reason: AuthenticationFailureReason) {
    super("Internal service authentication failed");
  }
}

interface StoredCredential {
  readonly service: InternalService;
  readonly capabilities: ReadonlySet<ServiceCapability>;
  readonly tokenDigest: Buffer;
}

@Injectable()
export class ServiceAuthenticationMetrics {
  private readonly failures = new Map<string, number>();

  record(
    service: InternalService | "unknown",
    reason: AuthenticationFailureReason,
  ) {
    const key = `${service}:${reason}`;
    this.failures.set(key, (this.failures.get(key) ?? 0) + 1);
  }

  snapshot() {
    return [...this.failures.entries()].map(([key, count]) => {
      const separator = key.indexOf(":");
      return {
        service: key.slice(0, separator) as InternalService | "unknown",
        reason: key.slice(separator + 1) as AuthenticationFailureReason,
        count,
      } as const;
    });
  }
}

@Injectable()
export class ServiceAuthenticator {
  private readonly credentials: readonly StoredCredential[];

  constructor(
    configuration: ServiceAuthenticationConfiguration,
    private readonly metrics = new ServiceAuthenticationMetrics(),
  ) {
    this.credentials = configuration.credentials.flatMap((credential) => [
      {
        service: credential.service,
        capabilities: credential.capabilities,
        tokenDigest: digest(credential.current.reveal()),
      },
      ...(credential.previous
        ? [
            {
              service: credential.service,
              capabilities: credential.capabilities,
              tokenDigest: digest(credential.previous.reveal()),
            },
          ]
        : []),
    ]);
    const digests = new Set(
      this.credentials.map((item) => item.tokenDigest.toString("hex")),
    );
    if (digests.size !== this.credentials.length) {
      throw new Error("Internal service credentials must be distinct");
    }
  }

  private fail(
    service: InternalService | "unknown",
    reason: AuthenticationFailureReason,
  ): never {
    this.metrics.record(service, reason);
    throw new ServiceAuthenticationError(reason);
  }

  authenticate(
    requestedService: string | undefined,
    authorization: string | undefined,
    capability: ServiceCapability,
  ): ServicePrincipal {
    const service =
      requestedService === "collector" || requestedService === "vmalert"
        ? requestedService
        : "unknown";
    const match = /^Bearer ([^\s]{16,512})$/.exec(authorization ?? "");
    if (!requestedService || !authorization) this.fail(service, "missing");
    if (service === "unknown" || !match) this.fail(service, "invalid");

    const suppliedDigest = digest(match[1] ?? "");
    let matched: StoredCredential | undefined;
    for (const credential of this.credentials) {
      if (timingSafeEqual(suppliedDigest, credential.tokenDigest)) {
        matched = credential;
      }
    }
    if (!matched) this.fail(service, "invalid");
    if (matched.service !== service || !matched.capabilities.has(capability)) {
      this.fail(service, "service_mismatch");
    }
    return { kind: "internal-service", service, capability };
  }
}

const serviceCapabilityMetadata = Symbol("service-capability");
const servicePrincipalKey = Symbol("service-principal");

export const RequireServiceCapability = (capability: ServiceCapability) =>
  SetMetadata(serviceCapabilityMetadata, capability);

type AuthenticatedRequest = IncomingMessage & {
  [servicePrincipalKey]?: ServicePrincipal;
};

export function servicePrincipalFrom(
  request: IncomingMessage,
): ServicePrincipal {
  const principal = (request as AuthenticatedRequest)[servicePrincipalKey];
  if (!principal)
    throw new UnauthorizedException("Internal service authentication failed");
  return principal;
}

@Injectable()
class InternalServiceAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authenticator: ServiceAuthenticator,
    private readonly metrics: ServiceAuthenticationMetrics,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const capability = this.reflector.getAllAndOverride<ServiceCapability>(
      serviceCapabilityMetadata,
      [context.getHandler(), context.getClass()],
    );
    const path = ((request.url ?? "").split("?", 1)[0] ?? "").toLowerCase();
    if (!capability && !path.startsWith("/internal/")) return true;
    if (!capability) {
      this.metrics.record("unknown", "configuration_error");
      throw new UnauthorizedException("Internal service authentication failed");
    }

    try {
      request[servicePrincipalKey] = this.authenticator.authenticate(
        Array.isArray(request.headers["x-nop-service"])
          ? request.headers["x-nop-service"][0]
          : request.headers["x-nop-service"],
        Array.isArray(request.headers.authorization)
          ? request.headers.authorization[0]
          : request.headers.authorization,
        capability,
      );
      return true;
    } catch (error) {
      if (error instanceof ServiceAuthenticationError) {
        throw new UnauthorizedException(
          "Internal service authentication failed",
        );
      }
      throw error;
    }
  }
}

const serviceAuthenticationConfiguration = Symbol(
  "service-authentication-configuration",
);

@Global()
@Module({
  providers: [
    ServiceAuthenticationMetrics,
    {
      provide: serviceAuthenticationConfiguration,
      useFactory: () => runtimeServiceAuthenticationConfig(),
    },
    {
      provide: ServiceAuthenticator,
      inject: [
        serviceAuthenticationConfiguration,
        ServiceAuthenticationMetrics,
      ],
      useFactory: (
        configuration: ServiceAuthenticationConfiguration,
        metrics: ServiceAuthenticationMetrics,
      ) => new ServiceAuthenticator(configuration, metrics),
    },
    InternalServiceAuthGuard,
    { provide: APP_GUARD, useExisting: InternalServiceAuthGuard },
  ],
  exports: [ServiceAuthenticator, ServiceAuthenticationMetrics],
})
export class InternalServiceAuthModule {}
