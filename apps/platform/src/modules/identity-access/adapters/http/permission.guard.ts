import {
  CanActivate,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { IncomingMessage } from "node:http";

import { requestIdFrom } from "../../../../http/request-id.js";
import {
  USER_AUTHORIZER,
  type AuthenticatedUserPrincipal,
  type PermissionCode,
  type UserAuthorizer,
} from "../../application/authorization.js";

const requiredPermissionMetadata = Symbol("required-permission");
const publicEndpointMetadata = Symbol("public-endpoint");
const userPrincipalKey = Symbol("user-principal");

export const RequirePermission = (permission: PermissionCode) =>
  SetMetadata(requiredPermissionMetadata, permission);

export const PublicEndpoint = () => SetMetadata(publicEndpointMetadata, true);

type UserRequest = IncomingMessage & {
  [userPrincipalKey]?: AuthenticatedUserPrincipal;
};

export function attachAuthenticatedUser(
  request: IncomingMessage,
  principal: AuthenticatedUserPrincipal,
): void {
  (request as UserRequest)[userPrincipalKey] = Object.freeze({ ...principal });
}

export function authenticatedUserFrom(
  request: IncomingMessage,
): AuthenticatedUserPrincipal | undefined {
  return (request as UserRequest)[userPrincipalKey];
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(USER_AUTHORIZER)
    private readonly authorization: UserAuthorizer,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean>(publicEndpointMetadata, targets)
    ) {
      return true;
    }

    const permission = this.reflector.getAllAndOverride<PermissionCode>(
      requiredPermissionMetadata,
      targets,
    );
    const request = context.switchToHttp().getRequest<IncomingMessage>();
    const allowed = await this.authorization.authorize(
      authenticatedUserFrom(request),
      permission,
      { requestId: requestIdFrom(request) },
    );
    if (!allowed) throw new ForbiddenException("Access is forbidden");
    return true;
  }
}
