import { describe, it, expect, vi } from 'vitest';
import {
  classifyGeminiError,
  callGeminiSafe,
  PRIMARY_GEMINI_MODEL,
  FALLBACK_GEMINI_MODEL
} from '../apps/decision-agent/src/services/geminiClient';

describe('Gemini Client & Error Classification', () => {
  it('should verify primary model is gemini-3.6-flash and fallback is gemini-3.5-flash', () => {
    expect(PRIMARY_GEMINI_MODEL).toBe('gemini-3.6-flash');
    expect(FALLBACK_GEMINI_MODEL).toBe('gemini-3.5-flash');
  });

  describe('classifyGeminiError', () => {
    it('should classify 404 / deprecated model error as MODEL_NOT_FOUND', () => {
      const err = {
        status: 404,
        message: 'This model models/gemini-2.5-flash is no longer available to new users.',
      };
      const res = classifyGeminiError(err);
      expect(res.category).toBe('MODEL_NOT_FOUND');
      expect(res.httpStatus).toBe(404);
      expect(res.category).not.toBe('RATE_LIMITED');
    });

    it('should classify 429 / resource exhausted error as RATE_LIMITED', () => {
      const err = {
        status: 429,
        error: { status: 'RESOURCE_EXHAUSTED' },
        message: 'Quota exceeded for quota metric Requests and limit 60 per minute.',
      };
      const res = classifyGeminiError(err);
      expect(res.category).toBe('RATE_LIMITED');
      expect(res.httpStatus).toBe(429);
      expect(res.isRetryable).toBe(true);
    });

    it('should classify 401 / 403 error as AUTHENTICATION_ERROR', () => {
      const err = {
        status: 403,
        message: 'API key not valid. Please pass a valid API key.',
      };
      const res = classifyGeminiError(err);
      expect(res.category).toBe('AUTHENTICATION_ERROR');
      expect(res.httpStatus).toBe(403);
      expect(res.isRetryable).toBe(false);
    });

    it('should classify 500 / 503 error as SERVER_ERROR', () => {
      const err = {
        status: 503,
        message: 'The service is currently unavailable.',
      };
      const res = classifyGeminiError(err);
      expect(res.category).toBe('SERVER_ERROR');
      expect(res.httpStatus).toBe(503);
      expect(res.isRetryable).toBe(true);
    });

    it('should classify network / timeout error as NETWORK_TIMEOUT', () => {
      const err = new Error('fetch failed: connect ETIMEDOUT');
      const res = classifyGeminiError(err);
      expect(res.category).toBe('NETWORK_TIMEOUT');
      expect(res.isRetryable).toBe(true);
    });
  });

  describe('callGeminiSafe', () => {
    it('should succeed on primary model gemini-3.6-flash if healthy', async () => {
      const mockGenerate = vi.fn().mockImplementation((opts) => {
        if (opts.model === 'gemini-3.6-flash') {
          return Promise.resolve({ text: 'Success response' });
        }
        throw new Error('Unexpected model call');
      });

      const mockAi = {
        models: { generateContent: mockGenerate },
      } as any;

      const res = await callGeminiSafe(mockAi, { contents: 'Hello' });
      expect(res.text).toBe('Success response');
      expect(mockGenerate).toHaveBeenCalledTimes(1);
      expect(mockGenerate).toHaveBeenCalledWith({ contents: 'Hello', model: 'gemini-3.6-flash' });
    });

    it('should fall back to gemini-3.5-flash if primary fails with retryable error (e.g. 404 or 429)', async () => {
      const mockGenerate = vi.fn().mockImplementation((opts) => {
        if (opts.model === 'gemini-3.6-flash') {
          const err = new Error('{"error":{"code":404,"message":"Model not found"}}');
          (err as any).status = 404;
          throw err;
        }
        if (opts.model === 'gemini-3.5-flash') {
          return Promise.resolve({ text: 'Fallback success' });
        }
        throw new Error('Unexpected model');
      });

      const mockAi = {
        models: { generateContent: mockGenerate },
      } as any;

      const res = await callGeminiSafe(mockAi, { contents: 'Hello' });
      expect(res.text).toBe('Fallback success');
      expect(mockGenerate).toHaveBeenCalledTimes(2);
      expect(mockGenerate).toHaveBeenNthCalledWith(1, { contents: 'Hello', model: 'gemini-3.6-flash' });
      expect(mockGenerate).toHaveBeenNthCalledWith(2, { contents: 'Hello', model: 'gemini-3.5-flash' });
    });

    it('should throw an explicit non-quota error when both models fail with 404', async () => {
      const mockGenerate = vi.fn().mockImplementation(() => {
        const err = new Error('{"error":{"code":404,"message":"Model not found"}}');
        (err as any).status = 404;
        throw err;
      });

      const mockAi = {
        models: { generateContent: mockGenerate },
      } as any;

      await expect(callGeminiSafe(mockAi, { contents: 'Hello' })).rejects.toThrow('Gemini API call failed (MODEL_NOT_FOUND)');
    });

    it('should throw a rate limiting / quota error when failing with 429', async () => {
      const mockGenerate = vi.fn().mockImplementation(() => {
        const err = new Error('{"error":{"code":429,"message":"Quota exceeded"}}');
        (err as any).status = 429;
        throw err;
      });

      const mockAi = {
        models: { generateContent: mockGenerate },
      } as any;

      await expect(callGeminiSafe(mockAi, { contents: 'Hello' })).rejects.toThrow('Gemini API rate limiting or quota exceeded (429)');
    });
  });
});
