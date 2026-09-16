import fs from 'fs';
import path from 'path';

export interface VipSubscriberRecord {
  accountNumber: string;
  telegramId?: string;
  telegramUsername?: string;
  name?: string;
  tier: 'VIP_INSTITUTIONAL';
  status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
  activatedAt: number;
  expiresAt: number;
  lastVerifiedAt?: number;
  notes?: string;
}

export interface VipSubscriptionStorage {
  subscribers: Record<string, VipSubscriberRecord>; // Key: accountNumber
  lastUpdated: string;
}

class VipSubscriptionService {
  private static instance: VipSubscriptionService;
  private filePath: string = path.resolve(process.cwd(), 'data', 'vip_subscribers.json');
  private subscribers: Map<string, VipSubscriberRecord> = new Map();

  private constructor() {
    this.ensureDataDirectory();
    this.loadFromDisk();
  }

  public static getInstance(): VipSubscriptionService {
    if (!VipSubscriptionService.instance) {
      VipSubscriptionService.instance = new VipSubscriptionService();
    }
    return VipSubscriptionService.instance;
  }

  private ensureDataDirectory() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const data: VipSubscriptionStorage = JSON.parse(raw);
        if (data && data.subscribers) {
          for (const [acc, record] of Object.entries(data.subscribers)) {
            this.subscribers.set(acc, record);
          }
        }
      } else {
        // Init default sample/admin account
        this.saveToDisk();
      }
    } catch (e: any) {
      console.warn('[VipSubscriptionService] Error loading vip subscribers:', e.message);
    }
  }

  private saveToDisk() {
    try {
      const obj: Record<string, VipSubscriberRecord> = {};
      for (const [acc, rec] of this.subscribers.entries()) {
        obj[acc] = rec;
      }
      const data: VipSubscriptionStorage = {
        subscribers: obj,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e: any) {
      console.warn('[VipSubscriptionService] Error saving vip subscribers:', e.message);
    }
  }

  /**
   * Register or extend a VIP cTrader account
   */
  public registerAccount(params: {
    accountNumber: string;
    telegramId?: string;
    telegramUsername?: string;
    name?: string;
    durationDays?: number;
    notes?: string;
  }): VipSubscriberRecord {
    const cleanAccount = params.accountNumber.trim().replace(/[^0-9]/g, '');
    const durationMs = (params.durationDays || 30) * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const existing = this.subscribers.get(cleanAccount);
    const expiresAt = existing && existing.expiresAt > now
      ? existing.expiresAt + durationMs
      : now + durationMs;

    const record: VipSubscriberRecord = {
      accountNumber: cleanAccount,
      telegramId: params.telegramId || existing?.telegramId,
      telegramUsername: params.telegramUsername || existing?.telegramUsername,
      name: params.name || existing?.name || (params.telegramUsername ? `@${params.telegramUsername}` : 'VIP Trader'),
      tier: 'VIP_INSTITUTIONAL',
      status: 'ACTIVE',
      activatedAt: existing?.activatedAt || now,
      expiresAt,
      notes: params.notes || existing?.notes || 'Registered via Telegram Bot'
    };

    this.subscribers.set(cleanAccount, record);
    this.saveToDisk();
    console.log(`🏛️ [VipSubscriptionService] Account ${cleanAccount} registered/renewed. Expires: ${new Date(expiresAt).toUTCString()}`);
    return record;
  }

  /**
   * Verify license validity for cTrader cBot
   */
  public verifyLicense(accountNumber: string): {
    valid: boolean;
    status: 'ACTIVE' | 'EXPIRED' | 'UNREGISTERED' | 'SUSPENDED';
    accountNumber: string;
    expiresAt?: number;
    remainingDays?: number;
    message: string;
  } {
    const cleanAccount = accountNumber.trim().replace(/[^0-9]/g, '');
    if (!cleanAccount) {
      return {
        valid: false,
        status: 'UNREGISTERED',
        accountNumber: cleanAccount,
        message: 'Nombor akaun tidak sah.'
      };
    }

    const record = this.subscribers.get(cleanAccount);
    if (!record) {
      return {
        valid: false,
        status: 'UNREGISTERED',
        accountNumber: cleanAccount,
        message: `Akaun cTrader [${cleanAccount}] tidak berdaftar dalam VIP Quantum AI. Sila daftar di @MyQuantumAIBot.`
      };
    }

    if (record.status === 'SUSPENDED') {
      return {
        valid: false,
        status: 'SUSPENDED',
        accountNumber: cleanAccount,
        message: `Akaun [${cleanAccount}] telah digantung. Sila hubungi pengurusan VIP.`
      };
    }

    const now = Date.now();
    if (now > record.expiresAt) {
      record.status = 'EXPIRED';
      this.saveToDisk();
      return {
        valid: false,
        status: 'EXPIRED',
        accountNumber: cleanAccount,
        expiresAt: record.expiresAt,
        remainingDays: 0,
        message: `Langganan VIP untuk akaun [${cleanAccount}] telah tamat tempoh pada ${new Date(record.expiresAt).toLocaleDateString()}. Sila perbaharui di @MyQuantumAIBot.`
      };
    }

    // Active
    record.lastVerifiedAt = now;
    const remainingDays = Math.max(1, Math.ceil((record.expiresAt - now) / (24 * 60 * 60 * 1000)));

    return {
      valid: true,
      status: 'ACTIVE',
      accountNumber: cleanAccount,
      expiresAt: record.expiresAt,
      remainingDays,
      message: `Akaun [${cleanAccount}] aktif. Baki langganan: ${remainingDays} hari.`
    };
  }

  /**
   * Find subscriber by Telegram ID
   */
  public getSubscriberByTelegramId(telegramId: string): VipSubscriberRecord | undefined {
    for (const rec of this.subscribers.values()) {
      if (rec.telegramId === String(telegramId)) {
        return rec;
      }
    }
    return undefined;
  }

  /**
   * Get all registered subscribers
   */
  public getAllSubscribers(): VipSubscriberRecord[] {
    return Array.from(this.subscribers.values());
  }
}

export const vipSubscriptionService = VipSubscriptionService.getInstance();
