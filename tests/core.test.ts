import { describe, it, expect } from 'vitest';
import { AppError } from '../packages/core/src/errors';
import { config } from '../packages/core/src/config';

describe('Core Foundation', () => {
  it('should initialize config properly', () => {
    expect(config.NODE_ENV).toBeDefined();
    expect(config.PORT).toBeDefined();
  });

  it('should create AppError correctly', () => {
    const error = new AppError('Test Error', 400);
    expect(error.message).toBe('Test Error');
    expect(error.statusCode).toBe(400);
    expect(error.isOperational).toBe(true);
  });
});
