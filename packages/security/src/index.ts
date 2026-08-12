import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError, logger } from '@iati/core';

// Audit Logger Foundation
export class AuditLogger {
  static async log(
    userId: string,
    action: string,
    resource: string,
    details: any
  ): Promise<void> {
    // In future sprints, this must write to an immutable audit_logs database table
    logger.info(`[AUDIT] User: ${userId} | Action: ${action} | Resource: ${resource} | Details: ${JSON.stringify(details)}`);
  }
}

// Auth Middleware Skeleton
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }

  const token = authHeader.split(' ')[1];
  const jwtSecret = process.env.JWT_SECRET || 'development-secret-do-not-use-in-prod';

  try {
    const decoded = jwt.verify(token, jwtSecret);
    // Attach user to request (assuming decoded has userId and role)
    (req as any).user = decoded;
    next();
  } catch (error) {
    throw new UnauthorizedError('Invalid or expired token');
  }
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
