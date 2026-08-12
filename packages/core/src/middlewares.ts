import { Request, Response, NextFunction } from 'express';
import { AppError } from './errors';
import { logger } from './logger';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.message} [${err.statusCode}]`);
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
    return;
  }

  logger.error('Unexpected Error:', err);
  res.status(500).json({
    status: 'error',
    message: 'Internal Server Error',
  });
};
