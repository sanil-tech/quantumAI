import crypto from 'crypto';

export interface EncryptedPayload {
  version: string;
  iv: string;
  authTag: string;
  ciphertext: string;
  formatted: string;
}

export interface CTraderBrokerCredentials {
  accountNumber: string;
  senderCompId?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  targetCompId?: string;
  host?: string;
  port?: number;
}

export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12; // 96 bits for GCM
  private static readonly AUTH_TAG_LENGTH = 16; // 128 bits
  private static readonly CURRENT_VERSION = 'v1';

  /**
   * Mendapatkan Master Encryption Key (32 bytes / 256 bits).
   */
  private static getMasterKey(): Buffer {
    const rawKey = process.env.ENCRYPTION_MASTER_KEY || process.env.JWT_SECRET || 'default-quantumai-encryption-master-key-32b';
    return crypto.createHash('sha256').update(rawKey).digest();
  }

  /**
   * Enkripsi teks biasa (Plaintext) menggunakan AES-256-GCM.
   */
  public static encrypt(plainText: string, associatedData?: string): EncryptedPayload {
    if (!plainText) {
      throw new Error('Encryption error: Plaintext cannot be empty');
    }

    const key = this.getMasterKey();
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv, {
      authTagLength: this.AUTH_TAG_LENGTH
    });

    if (associatedData) {
      cipher.setAAD(Buffer.from(associatedData, 'utf-8'));
    }

    let ciphertext = cipher.update(plainText, 'utf-8', 'hex');
    ciphertext += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    const ivHex = iv.toString('hex');

    const formatted = `enc:${this.CURRENT_VERSION}:${ivHex}:${authTag}:${ciphertext}`;

    return {
      version: this.CURRENT_VERSION,
      iv: ivHex,
      authTag,
      ciphertext,
      formatted
    };
  }

  /**
   * Nyahsulit (Decrypt) data tersulit AES-256-GCM.
   */
  public static decrypt(formattedOrPayload: string | EncryptedPayload, associatedData?: string): string {
    const key = this.getMasterKey();
    let version: string, ivHex: string, authTagHex: string, ciphertextHex: string;

    if (typeof formattedOrPayload === 'string') {
      const parts = formattedOrPayload.split(':');
      if (parts[0] !== 'enc' || parts.length < 5) {
        throw new Error('Decryption error: Invalid encrypted payload format');
      }
      version = parts[1];
      ivHex = parts[2];
      authTagHex = parts[3];
      ciphertextHex = parts[4];
    } else {
      version = formattedOrPayload.version;
      ivHex = formattedOrPayload.iv;
      authTagHex = formattedOrPayload.authTag;
      ciphertextHex = formattedOrPayload.ciphertext;
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv, {
      authTagLength: this.AUTH_TAG_LENGTH
    });

    decipher.setAuthTag(authTag);

    if (associatedData) {
      decipher.setAAD(Buffer.from(associatedData, 'utf-8'));
    }

    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');

    return decrypted;
  }

  /**
   * Enkripsikan objek kredensial cTrader sebelum disimpan ke DB.
   */
  public static encryptBrokerCredentials(credentials: CTraderBrokerCredentials, tenantId: string): string {
    const jsonStr = JSON.stringify(credentials);
    return this.encrypt(jsonStr, tenantId).formatted;
  }

  /**
   * Nyahsulitkan objek kredensial cTrader dari DB berdasarkan tenantId.
   */
  public static decryptBrokerCredentials(encryptedString: string, tenantId: string): CTraderBrokerCredentials {
    const jsonStr = this.decrypt(encryptedString, tenantId);
    return JSON.parse(jsonStr) as CTraderBrokerCredentials;
  }
}
