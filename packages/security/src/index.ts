import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError, logger } from '@iati/core';

export * from './crypto';

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  role: string;
  email?: string;
  [key: string]: any;
}

export interface TenantRequest extends Request {
  user?: AuthenticatedUser;
  tenantId?: string;
}

// Audit Logger Foundation
export class AuditLogger {
  static async log(
    userId: string,
    action: string,
    resource: string,
    details: any,
    tenantId?: string
  ): Promise<void> {
    logger.info(`[AUDIT] Tenant: ${tenantId || 'DEFAULT'} | User: ${userId} | Action: ${action} | Resource: ${resource} | Details: ${JSON.stringify(details)}`);
  }
}

// Auth Middleware with Tenant Enforcement
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }

  const token = authHeader.split(' ')[1];
  const jwtSecret = process.env.JWT_SECRET || 'default-quantumai-encryption-master-key-32b';

  try {
    const decoded = jwt.verify(token, jwtSecret) as any;
    
    // Normalize tenant_id / tenantId
    const tenantId = decoded.tenantId || decoded.tenant_id || '00000000-0000-0000-0000-000000000000';
    
    const user: AuthenticatedUser = {
      userId: decoded.userId || decoded.sub || 'anonymous',
      tenantId,
      role: decoded.role || 'USER',
      email: decoded.email
    };

    (req as any).user = user;
    (req as any).tenantId = tenantId;
    next();
  } catch (error) {
    throw new UnauthorizedError('Invalid or expired token');
  }
};

// Strict Multi-Tenant Enforcement Middleware
export const requireTenantAuth = (req: Request, res: Response, next: NextFunction) => {
  requireAuth(req, res, () => {
    const tenantId = (req as any).tenantId || req.headers['x-tenant-id'];
    if (!tenantId) {
      throw new UnauthorizedError('Missing required tenant context in request');
    }
    (req as any).tenantId = String(tenantId);
    next();
  });
};

// RBAC Middleware Skeleton
export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user || !roles.includes(user.role)) {
      throw new UnauthorizedError('Insufficient permissions');
    }
    next();
  };
};

/**
 * Utility helper to issue mock or production JWT tokens with tenant_id for testing / auth flow.
 */
export const issueTenantJwt = (payload: { userId: string; tenantId: string; role?: string; email?: string }, expiresIn: string = '24h'): string => {
  const jwtSecret = process.env.JWT_SECRET || 'default-quantumai-encryption-master-key-32b';
  return jwt.sign(payload, jwtSecret, { expiresIn: expiresIn as any });
};
