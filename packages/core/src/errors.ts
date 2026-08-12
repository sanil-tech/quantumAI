export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export enum ErrorCategory {
  RISK_REJECTED = 'RISK_REJECTED',
  AUTHORIZATION_FAILURE = 'AUTHORIZATION_FAILURE',
  VALIDATION_FAILURE = 'VALIDATION_FAILURE',
  QUEUE_FAILURE = 'QUEUE_FAILURE',
  BROKER_UNAVAILABLE = 'BROKER_UNAVAILABLE',
  BROKER_REJECTED = 'BROKER_REJECTED',
  BROKER_TIMEOUT = 'BROKER_TIMEOUT',
  WEBHOOK_FAILURE = 'WEBHOOK_FAILURE',
  RECONCILIATION_FAILURE = 'RECONCILIATION_FAILURE',
  PERSISTENCE_FAILURE = 'PERSISTENCE_FAILURE',
  RECOVERY_FAILURE = 'RECOVERY_FAILURE',
  UNKNOWN_EXECUTION_STATE = 'UNKNOWN_EXECUTION_STATE'
}

export class ExecutionCategorizedError extends AppError {
  public readonly category: ErrorCategory;
  public readonly executionId?: string;
  public readonly details?: any;

  constructor(
    category: ErrorCategory,
    message: string,
    statusCode = 500,
    executionId?: string,
    details?: any
  ) {
    super(message, statusCode);
    this.category = category;
    this.executionId = executionId;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not Found') {
    super(message, 404);
  }
}

