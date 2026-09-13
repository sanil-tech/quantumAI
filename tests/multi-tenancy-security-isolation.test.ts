import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { EncryptionService, issueTenantJwt, requireTenantAuth } from '@iati/security';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

describe('QUANTUMAI — MULTI-TENANCY SECURITY & AES-256-GCM ISOLATION SUITE', () => {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/quantumai';
  let pool: pg.Pool;

  const TENANT_A = '11111111-1111-1111-1111-111111111111';
  const TENANT_B = '22222222-2222-2222-2222-222222222222';

  const cleanupTestData = async () => {
    try {
      const client = await pool.connect();
      await client.query(`SET app.current_tenant_id = 'ALL'`);
      await client.query(`DELETE FROM orders WHERE tenant_id IN ($1, $2)`, [TENANT_A, TENANT_B]);
      await client.query(`DELETE FROM broker_connections WHERE tenant_id IN ($1, $2)`, [TENANT_A, TENANT_B]);
      client.release();
    } catch (e) {
      // ignore
    }
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 3000 });
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await pool.end().catch(() => {});
  }, 10000);

  describe('1. AES-256-GCM Broker Credential Encryption & Integrity Vault', () => {
    const sampleCredentials = {
      accountNumber: '5912914',
      senderCompId: 'demo.ctrader.5912914',
      password: 'Sanil88SecurePassword',
      host: 'demo-uk-eqx-01.p.c-trader.com',
      port: 5212
    };

    it('successfully encrypts broker credentials with AES-256-GCM', () => {
      const encrypted = EncryptionService.encryptBrokerCredentials(sampleCredentials, TENANT_A);
      expect(encrypted).toBeDefined();
      expect(encrypted.startsWith('enc:v1:')).toBe(true);

      const parts = encrypted.split(':');
      expect(parts.length).toBe(5); // enc, v1, iv, tag, ciphertext
      expect(parts[2].length).toBe(24); // 12 bytes IV = 24 hex chars
      expect(parts[3].length).toBe(32); // 16 bytes Tag = 32 hex chars
    });

    it('decrypts encrypted credentials accurately when matching Tenant ID is provided', () => {
      const encrypted = EncryptionService.encryptBrokerCredentials(sampleCredentials, TENANT_A);
      const decrypted = EncryptionService.decryptBrokerCredentials(encrypted, TENANT_A);

      expect(decrypted.accountNumber).toBe(sampleCredentials.accountNumber);
      expect(decrypted.senderCompId).toBe(sampleCredentials.senderCompId);
      expect(decrypted.password).toBe(sampleCredentials.password);
      expect(decrypted.port).toBe(5212);
    });

    it('throws AEAD authentication error if Tenant B attempts to decrypt Tenant A payload (cross-tenant attack)', () => {
      const encrypted = EncryptionService.encryptBrokerCredentials(sampleCredentials, TENANT_A);
      
      expect(() => {
        EncryptionService.decryptBrokerCredentials(encrypted, TENANT_B);
      }).toThrow();
    });

    it('throws error and detects ciphertext tampering (anti-tampering)', () => {
      const encrypted = EncryptionService.encryptBrokerCredentials(sampleCredentials, TENANT_A);
      const parts = encrypted.split(':');
      
      // Corrupt the ciphertext slightly
      const corruptedCiphertext = parts[4].slice(0, -2) + (parts[4].endsWith('0') ? '1' : '0');
      const tamperedPayload = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}:${corruptedCiphertext}`;

      expect(() => {
        EncryptionService.decryptBrokerCredentials(tamperedPayload, TENANT_A);
      }).toThrow();
    });
  });

  describe('2. JWT Tenant Token Claim & Middleware Verification', () => {
    it('generates a valid JWT containing tenantId and role', () => {
      const token = issueTenantJwt({
        userId: 'user-001',
        tenantId: TENANT_A,
        role: 'TRADER'
      });

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('middleware parses tenant context cleanly from Bearer token', () => {
      const token = issueTenantJwt({
        userId: 'user-001',
        tenantId: TENANT_A,
        role: 'TRADER'
      });

      const mockReq: any = {
        headers: {
          authorization: `Bearer ${token}`
        }
      };
      const mockRes: any = {};
      let nextCalled = false;

      requireTenantAuth(mockReq, mockRes, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(mockReq.tenantId).toBe(TENANT_A);
      expect(mockReq.user.userId).toBe('user-001');
    });
  });

  describe('3. PostgreSQL Row-Level Security (RLS) Multi-Tenant Isolation', () => {
    it('Tenant A can insert and read their own broker connection and orders', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Switch to application tenant role (subject to strict RLS)
        await client.query(`SET ROLE app_tenant_user`);
        // Set context to Tenant A
        await client.query(`SET LOCAL app.current_tenant_id = '${TENANT_A}'`);

        const encCreds = EncryptionService.encryptBrokerCredentials({ accountNumber: '5912914' }, TENANT_A);
        
        await client.query(`
          INSERT INTO broker_connections (id, tenant_id, account_number, encrypted_credentials)
          VALUES ($1, $2, $3, $4)
        `, ['conn-tenant-a-1', TENANT_A, '5912914', encCreds]);

        await client.query(`
          INSERT INTO orders (order_id, tenant_id, proposal_id, approval_id, account_id, symbol, direction, quantity, order_type, status, broker_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, ['ord-tenant-a-1', TENANT_A, 'prop-1', 'appr-1', 'acc-a', 'EURUSD', 'BUY', 0.10, 'MARKET', 'FILLED', 'CTRADER']);

        const readOrders = await client.query(`SELECT * FROM orders WHERE order_id = 'ord-tenant-a-1'`);
        expect(readOrders.rows.length).toBe(1);
        expect(readOrders.rows[0].tenant_id).toBe(TENANT_A);

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        await client.query(`RESET ROLE`);
        client.release();
      }
    });

    it('Tenant B CANNOT view or read Tenant A orders or broker connections due to RLS', async () => {
      const client = await pool.connect();
      try {
        // Switch to application tenant role (subject to strict RLS)
        await client.query(`SET ROLE app_tenant_user`);
        // Set context to Tenant B
        await client.query(`SET app.current_tenant_id = '${TENANT_B}'`);

        // Attempt to query Tenant A's order
        const ordersRes = await client.query(`SELECT * FROM orders WHERE order_id = 'ord-tenant-a-1'`);
        expect(ordersRes.rows.length).toBe(0); // STRICTLY 0 rows returned by RLS policy

        // Attempt to query Tenant A's connection
        const connRes = await client.query(`SELECT * FROM broker_connections WHERE id = 'conn-tenant-a-1'`);
        expect(connRes.rows.length).toBe(0); // STRICTLY 0 rows returned by RLS policy

      } finally {
        await client.query(`RESET ROLE`);
        client.release();
      }
    });

    it('Tenant B cannot modify or inject orders into Tenant A namespace', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Switch to application tenant role (subject to strict RLS)
        await client.query(`SET ROLE app_tenant_user`);
        // Set context to Tenant B
        await client.query(`SET LOCAL app.current_tenant_id = '${TENANT_B}'`);

        // Attempt to insert order with Tenant A's tenant_id while authenticated as Tenant B
        let errorThrown = false;
        try {
          await client.query(`
            INSERT INTO orders (order_id, tenant_id, proposal_id, approval_id, account_id, symbol, direction, quantity, order_type, status, broker_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `, ['ord-spoof-b-to-a', TENANT_A, 'prop-1', 'appr-1', 'acc-a', 'GBPUSD', 'BUY', 0.10, 'MARKET', 'PENDING', 'CTRADER']);
        } catch (err: any) {
          errorThrown = true;
          expect(err.message.toLowerCase()).toContain('row-level security');
        }

        expect(errorThrown).toBe(true);
        await client.query('ROLLBACK');
      } finally {
        await client.query(`RESET ROLE`);
        client.release();
      }
    });
  });
});
