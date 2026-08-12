export function redactSensitiveData(data: any, depth = 0): any {
  if (data === null || data === undefined) return data;
  if (depth > 8) return '[MAX_DEPTH_REACHED]';

  if (typeof data === 'string') {
    if (data.startsWith('eyJ') && data.split('.').length === 3) {
      return '[REDACTED_JWT]';
    }
    return data;
  }

  if (typeof data !== 'object') return data;

  if (data instanceof Date) return data;
  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item, depth + 1));
  }

  const redacted: Record<string, any> = {};
  const sensitiveKeys = [
    'approval_token',
    'approvaltoken',
    'token',
    'signature',
    'governancesignature',
    'secret',
    'apikey',
    'api_key',
    'password',
    'privatekey',
    'private_key',
    'credentials',
    'authorization',
    'auth',
    'jwt',
    'dburl',
    'db_url'
  ];

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (
      sensitiveKeys.some(
        (s) =>
          lowerKey === s ||
          lowerKey.includes('secret') ||
          lowerKey.includes('password') ||
          lowerKey.includes('signature')
      )
    ) {
      if (typeof value === 'object' && value !== null) {
        const v = value as any;
        if (v.approvalId || v.approval_id) {
          redacted[key] = {
            approvalId: v.approvalId || v.approval_id,
            status: v.status || 'REDACTED',
            riskCheckTimestamp: v.riskCheckTimestamp || v.timestamp,
            redacted: '[REDACTED_SENSITIVE_TOKEN]'
          };
        } else {
          redacted[key] = '[REDACTED_SENSITIVE_OBJECT]';
        }
      } else {
        redacted[key] = '[REDACTED]';
      }
    } else {
      redacted[key] = redactSensitiveData(value, depth + 1);
    }
  }

  return redacted;
}
