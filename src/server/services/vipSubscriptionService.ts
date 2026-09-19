import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface VipAuthPayload {
  licenseId: string;
  accountNumber: string;
  name?: string;
  telegramId?: string;
  telegramUsername?: string;
  tier: 'VIP_INSTITUTIONAL';
  issuedAt: number;
  expiresAt: number;
  jti: string;
  environment: string;
}

export interface VipSubscriberRecord {
  accountNumber: string;
  telegramId?: string;
  telegramUsername?: string;
  name?: string;
  tier: 'VIP_INSTITUTIONAL';
  status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'PENDING_VERIFICATION';
  activatedAt: number;
  expiresAt: number;
  lastVerifiedAt?: number;
  notes?: string;
  authToken?: string;
  lastReminderStageSent?: number;
}

export interface VipSubscriptionStorage {
  subscribers: Record<string, VipSubscriberRecord>; // Key: accountNumber
  lastUpdated: string;
}

let ephemeralSecret: string | null = null;
export function getVipSigningSecret(): string {
  if (process.env.VIP_AUTH_SECRET && process.env.VIP_AUTH_SECRET.trim().length > 0) {
    return process.env.VIP_AUTH_SECRET.trim();
  }
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length > 0) {
    return process.env.JWT_SECRET.trim();
  }
  if (!ephemeralSecret) {
    ephemeralSecret = crypto.randomBytes(32).toString('hex');
    console.warn('⚠️ [VipSubscriptionService] No VIP_AUTH_SECRET or JWT_SECRET configured. Initialized cryptographically random ephemeral secret.');
  }
  return ephemeralSecret;
}

export function signVipToken(payload: VipAuthPayload, secret?: string): string {
  const signingKey = secret || getVipSigningSecret();
  const header = { alg: 'HS256', typ: 'QAI_VIP' };
  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const dataToSign = `${b64Header}.${b64Payload}`;
  const signature = crypto.createHmac('sha256', signingKey).update(dataToSign).digest('base64url');
  return `qai_vip_${dataToSign}.${signature}`;
}

export function verifyVipTokenSignature(tokenStr: string, secret?: string): { valid: boolean; payload?: VipAuthPayload; error?: string } {
  if (!tokenStr || typeof tokenStr !== 'string') {
    return { valid: false, error: 'TOKEN_MISSING' };
  }
  const clean = tokenStr.trim().startsWith('qai_vip_') ? tokenStr.trim().slice(8) : tokenStr.trim();
  const parts = clean.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'MALFORMED_TOKEN_STRUCTURE' };
  }
  const [b64Header, b64Payload, signature] = parts;
  const dataToSign = `${b64Header}.${b64Payload}`;
  const signingKey = secret || getVipSigningSecret();
  const expectedSig = crypto.createHmac('sha256', signingKey).update(dataToSign).digest('base64url');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, error: 'INVALID_SIGNATURE' };
  }

  try {
    const payload: VipAuthPayload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
    if (!payload.accountNumber || !payload.expiresAt) {
      return { valid: false, error: 'INVALID_PAYLOAD_STRUCTURE' };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, error: 'PAYLOAD_DECODE_FAILED' };
  }
}

class VipSubscriptionService {
  private static instance: VipSubscriptionService;
  private filePath: string = path.resolve(process.cwd(), 'data', 'vip_subscribers.json');
  private deliveryLedgerPath: string = path.resolve(process.cwd(), 'data', 'copier_deliveries.json');
  private subscribers: Map<string, VipSubscriberRecord> = new Map();
  private deliveredSignals: Map<string, Set<string>> = new Map();

  private constructor() {
    this.ensureDataDirectory();
    this.loadFromDisk();
    this.loadDeliveryLedger();
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

  private loadDeliveryLedger() {
    try {
      if (fs.existsSync(this.deliveryLedgerPath)) {
        const raw = fs.readFileSync(this.deliveryLedgerPath, 'utf-8');
        const data: Record<string, string[]> = JSON.parse(raw);
        if (data && typeof data === 'object') {
          for (const [acc, signals] of Object.entries(data)) {
            this.deliveredSignals.set(acc, new Set(Array.isArray(signals) ? signals : []));
          }
        }
      }
    } catch (e: any) {
      console.warn('[VipSubscriptionService] Could not load delivery ledger:', e.message);
    }
  }

  private saveDeliveryLedger() {
    try {
      const obj: Record<string, string[]> = {};
      for (const [acc, sigSet] of this.deliveredSignals.entries()) {
        obj[acc] = Array.from(sigSet);
      }
      fs.writeFileSync(this.deliveryLedgerPath, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (e: any) {
      console.warn('[VipSubscriptionService] Could not save delivery ledger:', e.message);
    }
  }

  public isSignalDelivered(accountNumber: string, signalId: string): boolean {
    const cleanAccount = accountNumber.trim().replace(/[^0-9]/g, '');
    const set = this.deliveredSignals.get(cleanAccount);
    return set ? set.has(signalId) : false;
  }

  public recordSignalDelivery(accountNumber: string, signalId: string): void {
    const cleanAccount = accountNumber.trim().replace(/[^0-9]/g, '');
    let set = this.deliveredSignals.get(cleanAccount);
    if (!set) {
      set = new Set();
      this.deliveredSignals.set(cleanAccount, set);
    }
    set.add(signalId);
    this.saveDeliveryLedger();
  }

  /**
   * Generates a cryptographically signed VIP Authorization Token for an active account
   */
  public generateVipToken(accountNumber: string): string {
    const cleanAccount = accountNumber.trim().replace(/[^0-9]/g, '');
    const subscriber = this.subscribers.get(cleanAccount);
    if (!subscriber || subscriber.status !== 'ACTIVE' || subscriber.expiresAt <= Date.now()) {
      throw new Error(`CANNOT_ISSUE_TOKEN: Account ${cleanAccount} is not an active VIP subscriber.`);
    }

    const payload: VipAuthPayload = {
      licenseId: `lic_${cleanAccount}`,
      accountNumber: cleanAccount,
      name: subscriber.name,
      telegramId: subscriber.telegramId,
      telegramUsername: subscriber.telegramUsername,
      tier: 'VIP_INSTITUTIONAL',
      issuedAt: Date.now(),
      expiresAt: subscriber.expiresAt,
      jti: crypto.randomBytes(16).toString('hex'),
      environment: process.env.NODE_ENV || 'production'
    };

    const token = signVipToken(payload);
    subscriber.authToken = token;
    this.saveToDisk();
    return token;
  }

  /**
   * Server-authoritative VIP token verification binding signature, expiration, account, and subscriber ledger
   */
  public verifyVipToken(token: string, expectedAccount?: string): {
    valid: boolean;
    status: 'ACTIVE' | 'EXPIRED' | 'UNREGISTERED' | 'SUSPENDED' | 'PENDING_VERIFICATION' | 'INVALID_TOKEN' | 'ACCOUNT_MISMATCH';
    error?: string;
    message: string;
    subscriber?: VipSubscriberRecord;
    payload?: VipAuthPayload;
  } {
    if (!token) {
      return {
        valid: false,
        status: 'INVALID_TOKEN',
        error: 'TOKEN_REQUIRED',
        message: 'VIP Authorization token required. Sila sertakan VipAuthToken rasmi anda.'
      };
    }

    const sigResult = verifyVipTokenSignature(token);
    if (!sigResult.valid || !sigResult.payload) {
      return {
        valid: false,
        status: 'INVALID_TOKEN',
        error: sigResult.error || 'INVALID_SIGNATURE',
        message: `Token VIP tidak sah atau telah diubahsuai (${sigResult.error || 'BAD_SIGNATURE'}).`
      };
    }

    const payload = sigResult.payload;
    const cleanTokenAccount = payload.accountNumber.trim().replace(/[^0-9]/g, '');

    // Strict account binding assertion
    if (expectedAccount) {
      const cleanExpected = expectedAccount.trim().replace(/[^0-9]/g, '');
      if (cleanExpected !== cleanTokenAccount) {
        return {
          valid: false,
          status: 'ACCOUNT_MISMATCH',
          error: 'ACCOUNT_MISMATCH',
          message: `Token ini didaftarkan untuk akaun [${cleanTokenAccount}], bukan akaun [${cleanExpected}]. Token sharing dilarang.`
        };
      }
    }

    // Token expiration check
    const now = Date.now();
    if (now >= payload.expiresAt) {
      return {
        valid: false,
        status: 'EXPIRED',
        error: 'TOKEN_EXPIRED',
        message: `Token VIP telah tamat tempoh pada ${new Date(payload.expiresAt).toLocaleDateString()}. Sila perbaharui di @MyQuantumAIBot.`
      };
    }

    // Server-side authoritative ledger verification
    const subscriber = this.subscribers.get(cleanTokenAccount);
    if (!subscriber) {
      return {
        valid: false,
        status: 'UNREGISTERED',
        error: 'SUBSCRIBER_NOT_FOUND',
        message: `Akaun [${cleanTokenAccount}] tiada dalam pangkalan data VIP aktif.`
      };
    }

    if (subscriber.status === 'SUSPENDED') {
      return {
        valid: false,
        status: 'SUSPENDED',
        error: 'ACCOUNT_SUSPENDED',
        message: `Akaun [${cleanTokenAccount}] telah digantung oleh pihak pengurusan.`
      };
    }

    if (subscriber.status === 'PENDING_VERIFICATION') {
      return {
        valid: false,
        status: 'PENDING_VERIFICATION',
        error: 'PENDING_VERIFICATION',
        message: `Akaun [${cleanTokenAccount}] sedang menunggu pengesahan admin.`
      };
    }

    if (now >= subscriber.expiresAt || subscriber.status === 'EXPIRED') {
      subscriber.status = 'EXPIRED';
      this.saveToDisk();
      return {
        valid: false,
        status: 'EXPIRED',
        error: 'SUBSCRIPTION_EXPIRED',
        message: `Langganan akaun [${cleanTokenAccount}] telah luput pada ${new Date(subscriber.expiresAt).toLocaleDateString()}.`
      };
    }

    subscriber.lastVerifiedAt = now;
    return {
      valid: true,
      status: 'ACTIVE',
      message: `Akaun [${cleanTokenAccount}] disahkan aktif.`,
      subscriber,
      payload
    };
  }

  public createSubscription(params: {
    accountNumber: string;
    telegramUserId?: string;
    telegramUsername?: string;
    brokerType?: string;
    planType?: string;
    name?: string;
    durationDays?: number;
  }) {
    return this.registerAccount({
      accountNumber: params.accountNumber,
      telegramId: params.telegramUserId,
      telegramUsername: params.telegramUsername,
      name: params.name || (params.telegramUsername ? `@${params.telegramUsername}` : `cTID Trader ${params.accountNumber}`),
      status: 'ACTIVE',
      durationDays: params.durationDays || 7, // 7-Day Free Trial default for instant 1-click onboarding
      isAdminApproval: true
    });
  }

  /**
   * Register a VIP cTrader account.
   * By default, public/bot requests enter PENDING_VERIFICATION status.
   * Only admin-authorized actions can directly activate VIP.
   */
  public registerAccount(params: {
    accountNumber: string;
    telegramId?: string;
    telegramChatId?: string;
    telegramUsername?: string;
    name?: string;
    tier?: string;
    durationDays?: number;
    notes?: string;
    isAdminApproval?: boolean;
    status?: 'ACTIVE' | 'PENDING_VERIFICATION';
  }): VipSubscriberRecord & { token?: string } {
    const cleanAccount = params.accountNumber.trim().replace(/[^0-9]/g, '');
    const now = Date.now();
    const existing = this.subscribers.get(cleanAccount);
    const telegramId = params.telegramId || params.telegramChatId;

    // If existing account is already ACTIVE and not expired, maintain active state
    const isAlreadyActive = existing && existing.status === 'ACTIVE' && existing.expiresAt > now;
    const shouldActivate = params.isAdminApproval === true || params.status === 'ACTIVE' || isAlreadyActive;

    const durationDays = params.durationDays || 30;
    const durationMs = durationDays * 24 * 60 * 60 * 1000;

    let expiresAt = 0;
    let status: 'ACTIVE' | 'PENDING_VERIFICATION' = 'PENDING_VERIFICATION';

    if (shouldActivate) {
      status = 'ACTIVE';
      expiresAt = existing && existing.expiresAt > now
        ? existing.expiresAt + durationMs
        : now + durationMs;
    }

    const record: VipSubscriberRecord = {
      accountNumber: cleanAccount,
      telegramId: telegramId || existing?.telegramId,
      telegramUsername: params.telegramUsername || existing?.telegramUsername,
      name: params.name || existing?.name || (params.telegramUsername ? `@${params.telegramUsername}` : 'VIP Trader'),
      tier: 'VIP_INSTITUTIONAL',
      status,
      activatedAt: status === 'ACTIVE' ? (existing?.activatedAt || now) : 0,
      expiresAt,
      notes: params.notes || existing?.notes || (status === 'ACTIVE' ? 'Admin Approved / Active VIP' : 'Pending Admin Verification')
    };

    let token: string | undefined = undefined;
    if (status === 'ACTIVE') {
      token = signVipToken({
        licenseId: `lic_${cleanAccount}`,
        accountNumber: cleanAccount,
        name: record.name,
        telegramId: record.telegramId,
        telegramUsername: record.telegramUsername,
        tier: 'VIP_INSTITUTIONAL',
        issuedAt: now,
        expiresAt,
        jti: crypto.randomBytes(16).toString('hex'),
        environment: process.env.NODE_ENV || 'production'
      });
      record.authToken = token;
    }

    this.subscribers.set(cleanAccount, record);
    this.saveToDisk();
    console.log(`🏛️ [VipSubscriptionService] Account ${cleanAccount} registered (Status: ${status}). Expires: ${expiresAt ? new Date(expiresAt).toUTCString() : 'N/A'}`);
    return { ...record, token };
  }

  /**
   * Admin-authorized activation of a pending or existing VIP subscriber
   */
  public activateAccount(accountNumber: string, durationDays: number = 30, approvedBy?: string): VipSubscriberRecord & { token: string } {
    const cleanAccount = accountNumber.trim().replace(/[^0-9]/g, '');
    const now = Date.now();
    const durationMs = durationDays * 24 * 60 * 60 * 1000;
    const existing = this.subscribers.get(cleanAccount);

    const expiresAt = existing && existing.expiresAt > now && durationDays > 0
      ? existing.expiresAt + durationMs
      : now + durationMs;

    const token = signVipToken({
      licenseId: `lic_${cleanAccount}`,
      accountNumber: cleanAccount,
      name: existing?.name || 'VIP Trader',
      telegramId: existing?.telegramId,
      telegramUsername: existing?.telegramUsername,
      tier: 'VIP_INSTITUTIONAL',
      issuedAt: now,
      expiresAt,
      jti: crypto.randomBytes(16).toString('hex'),
      environment: process.env.NODE_ENV || 'production'
    });

    const record: VipSubscriberRecord = {
      accountNumber: cleanAccount,
      telegramId: existing?.telegramId,
      telegramUsername: existing?.telegramUsername,
      name: existing?.name || 'VIP Trader',
      tier: 'VIP_INSTITUTIONAL',
      status: expiresAt > now ? 'ACTIVE' : 'EXPIRED',
      activatedAt: existing?.activatedAt || now,
      expiresAt,
      authToken: token,
      notes: `Activated by admin (${approvedBy || 'Console'}) on ${new Date().toISOString()}`
    };

    this.subscribers.set(cleanAccount, record);
    this.saveToDisk();
    console.log(`✅ [VipSubscriptionService] Account ${cleanAccount} APPROVED & ACTIVATED by ${approvedBy || 'Admin'}. Expires: ${new Date(expiresAt).toUTCString()}`);
    return { ...record, token };
  }

  /**
   * Admin-authorized suspension/rejection of an account
   */
  public rejectAccount(accountNumber: string, reason: string = 'Administrative review rejected'): VipSubscriberRecord | null {
    const cleanAccount = accountNumber.trim().replace(/[^0-9]/g, '');
    const existing = this.subscribers.get(cleanAccount);
    if (!existing) return null;

    existing.status = 'SUSPENDED';
    existing.notes = reason;
    this.subscribers.set(cleanAccount, existing);
    this.saveToDisk();
    console.log(`⛔ [VipSubscriptionService] Account ${cleanAccount} REJECTED/SUSPENDED. Reason: ${reason}`);
    return existing;
  }

  /**
   * Admin-authorized revocation of a VIP subscription
   */
  public revokeAccount(accountNumber: string, reason: string = 'VIP subscription revoked'): VipSubscriberRecord | null {
    return this.rejectAccount(accountNumber, reason);
  }

  /**
   * Verify license validity for cTrader cBot
   */
  public verifyLicense(accountNumber: string): {
    valid: boolean;
    status: 'ACTIVE' | 'EXPIRED' | 'UNREGISTERED' | 'SUSPENDED' | 'PENDING_VERIFICATION';
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

    if (record.status === 'PENDING_VERIFICATION') {
      return {
        valid: false,
        status: 'PENDING_VERIFICATION',
        accountNumber: cleanAccount,
        message: `Akaun [${cleanAccount}] telah didaftarkan tetapi sedang MENUNGGU PENGESAHAN admin / pembayaran. cBot tidak dibenarkan execute sehingga diaktifkan.`
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

  /**
   * Get comprehensive subscriber statistics and telemetry for admin monitoring & promotion
   */
  public getSubscriberAnalytics() {
    const all = Array.from(this.subscribers.values());
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const oneHourMs = 60 * 60 * 1000;

    let activeCount = 0;
    let expiredCount = 0;
    let pendingCount = 0;
    let expiringSoonCount = 0; // <= 7 days
    let onlineRecentlyCount = 0; // verified in last 2 hours

    const expiringSoonList: Array<{
      accountNumber: string;
      telegramUsername?: string;
      name?: string;
      daysRemaining: number;
    }> = [];

    for (const sub of all) {
      if (sub.status === 'PENDING_VERIFICATION') {
        pendingCount++;
      } else if (sub.status === 'ACTIVE' && sub.expiresAt > now) {
        activeCount++;
        const remaining = Math.ceil((sub.expiresAt - now) / oneDayMs);
        if (remaining <= 7) {
          expiringSoonCount++;
          expiringSoonList.push({
            accountNumber: sub.accountNumber,
            telegramUsername: sub.telegramUsername,
            name: sub.name,
            daysRemaining: remaining
          });
        }
      } else {
        expiredCount++;
      }

      if (sub.lastVerifiedAt && (now - sub.lastVerifiedAt) <= 2 * oneHourMs) {
        onlineRecentlyCount++;
      }
    }

    return {
      totalSubscribers: all.length,
      activeCount,
      pendingCount,
      expiredCount,
      expiringSoonCount,
      onlineRecentlyCount,
      expiringSoonList,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Dispatches an interactive reminder message to a subscriber about their trial or subscription expiry
   */
  public async sendExpiryReminderToSubscriber(accountNumber: string, customNote?: string): Promise<{ success: boolean; message: string; daysRemaining?: number }> {
    const cleanAccount = accountNumber.trim().replace(/[^0-9]/g, '');
    const sub = this.subscribers.get(cleanAccount);
    if (!sub) {
      return { success: false, message: `Akaun #${cleanAccount} tidak dijumpai dalam rekod subscriber.` };
    }

    if (!sub.telegramId) {
      return { success: false, message: `Akaun #${cleanAccount} tiada Telegram ID yang dipautkan untuk menerima mesej peringatan.` };
    }

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const daysRemaining = Math.max(0, Math.ceil((sub.expiresAt - now) / oneDayMs));
    const expDate = sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString() : 'N/A';

    const { telegramNotificationService } = await import('./telegramNotificationService');
    const userLang = telegramNotificationService.getUserLanguage(sub.telegramId);
    const isEn = userLang === 'en';

    let reminderText = '';
    if (daysRemaining > 1) {
      reminderText = isEn
        ? `👋 *[QUANTUM AI — 7-DAY TRIAL STATUS UPDATE]* ⏳\n\n` +
          `Hello, *${sub.name || 'Trader'}*!\n` +
          `Your 7-Day Free Copier Trial for cTrader account \`${sub.accountNumber}\` has *${daysRemaining} days remaining* (Valid until \`${expDate}\`).\n\n` +
          `💡 *Next Step to Keep Trading 24/5:*\n` +
          `Upgrade your copier to a **Live Real Account** for only **RM79/month** (~$19 USD) to continue receiving automatic institutional SMC trade execution!\n\n` +
          (customNote ? `💬 _Note from Admin:_ ${customNote}\n\n` : '') +
          `👉 *To subscribe or ask questions, contact:* *@sanilbans*`
        : `👋 *[QUANTUM AI — PERINGATAN BAKI HARI PERCUBAAN]* ⏳\n\n` +
          `Hai, *${sub.name || 'Trader'}*!\n` +
          `Percubaan 7 Hari percuma untuk akaun cTrader anda \`${sub.accountNumber}\` kini berbaki *${daysRemaining} hari lagi* (Sah sehingga \`${expDate}\`).\n\n` +
          `💡 *Langkah Seterusnya untuk Meneruskan Profit:*\n` +
          `Naik taraf copier anda ke **Akaun Real (Live)** dengan yuran berpatutan **RM79/bulan** untuk mengekalkan salinan trade autopilot institusi Smart Money Concepts (SMC) tanpa gangguan!\n\n` +
          (customNote ? `💬 _Pesanan Admin:_ ${customNote}\n\n` : '') +
          `👉 *Untuk melanggan atau sebarang pertanyaan, hubungi:* *@sanilbans*`;
    } else if (daysRemaining === 1) {
      reminderText = isEn
        ? `⏳ *[QUANTUM AI — TRIAL EXPIRING TOMORROW]* 🚨\n\n` +
          `Your 7-Day Free Trial for cTrader account \`${sub.accountNumber}\` will expire **tomorrow** (\`${expDate}\`).\n\n` +
          `💎 *Transition to VIP Live Real Account (RM79/month):*\n` +
          `Lock in your spot today to ensure seamless trade replication directly to your real trading account without missing any market moves!\n\n` +
          `👉 *Contact Admin to renew:* *@sanilbans*`
        : `⏳ *[QUANTUM AI — PERCUBAAN TAMAT ESOK]* 🚨\n\n` +
          `Percubaan 7 Hari percuma bagi akaun cTrader \`${sub.accountNumber}\` akan **tamat esok** (\`${expDate}\`).\n\n` +
          `💎 *Peralihan ke Akaun Real (Live) — RM79/bulan:*\n` +
          `Dapatkan langganan VIP anda hari ini untuk memastikan trade terus disalin ke akaun sebenar anda tanpa terlepas sebarang peluang pasaran!\n\n` +
          `👉 *Hubungi Admin untuk langganan:* *@sanilbans*`;
    } else {
      reminderText = isEn
        ? `🔒 *[QUANTUM AI — 7-DAY TRIAL COMPLETED]* 🏛️\n\n` +
          `Your 7-Day Free Trial for cTrader account \`${sub.accountNumber}\` has ended.\n\n` +
          `Thank you for testing our institutional algorithmic system! If you enjoyed the results, you can reactivate 24/5 cloud copier access on your **Live Real Account** anytime for only **RM79/month**.\n\n` +
          `👉 *Ready to upgrade? Contact:* *@sanilbans*`
        : `🔒 *[QUANTUM AI — TEMPOH PERCUBAAN 7 HARI TAMAT]* 🏛️\n\n` +
          `Tempoh percubaan 7 hari percuma bagi akaun cTrader anda \`${sub.accountNumber}\` telah selesai.\n\n` +
          `Terima kasih kerana menguji sistem algoritma institusi kami! Sekiranya anda berpuas hati dengan hasil dagangan, anda boleh mengaktifkan semula copier pada **Akaun Real (Live)** bila-bila masa dengan hanya **RM79/bulan**.\n\n` +
          `👉 *Sedia untuk aktifkan akaun real? Hubungi:* *@sanilbans*`;
    }

    await telegramNotificationService.sendRawMessage(
      reminderText,
      sub.telegramId,
      telegramNotificationService.getOnboardingKeyboard(userLang)
    );

    return {
      success: true,
      message: `Peringatan berjaya dihantar ke Telegram pelanggan (${sub.telegramUsername ? '@' + sub.telegramUsername : sub.telegramId}) bagi akaun #${cleanAccount} (Baki: ${daysRemaining} hari).`,
      daysRemaining
    };
  }

  /**
   * Automated periodic check that dispatches reminder notifications to subscribers nearing expiry
   */
  public async checkAndDispatchAutomatedReminders(): Promise<{ sentCount: number }> {
    let sentCount = 0;
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    for (const sub of this.subscribers.values()) {
      if (sub.telegramId && sub.expiresAt) {
        const daysRemaining = Math.max(0, Math.ceil((sub.expiresAt - now) / oneDayMs));

        // Day 7 / Expired (0 days remaining)
        if (daysRemaining === 0 && sub.lastReminderStageSent !== 0) {
          try {
            await this.sendExpiryReminderToSubscriber(sub.accountNumber);
            sub.lastReminderStageSent = 0;
            sub.status = 'EXPIRED';
            this.saveToDisk();
            sentCount++;
            console.log(`[VipSubscriptionService] Automated Expired notice dispatched to #${sub.accountNumber}`);
          } catch (e: any) {
            console.warn(`[VipSubscriptionService] Failed to send expired reminder to ${sub.accountNumber}:`, e.message);
          }
        }
        // Day 6 / Expiring Tomorrow (1 day remaining)
        else if (daysRemaining === 1 && sub.status === 'ACTIVE' && sub.lastReminderStageSent !== 1) {
          try {
            await this.sendExpiryReminderToSubscriber(sub.accountNumber);
            sub.lastReminderStageSent = 1;
            this.saveToDisk();
            sentCount++;
            console.log(`[VipSubscriptionService] Automated 1-Day reminder dispatched to #${sub.accountNumber}`);
          } catch (e: any) {
            console.warn(`[VipSubscriptionService] Failed to send 1-day reminder to ${sub.accountNumber}:`, e.message);
          }
        }
        // Day 5 / 2 Days Remaining
        else if (daysRemaining === 2 && sub.status === 'ACTIVE' && sub.lastReminderStageSent !== 2) {
          try {
            await this.sendExpiryReminderToSubscriber(sub.accountNumber);
            sub.lastReminderStageSent = 2;
            this.saveToDisk();
            sentCount++;
            console.log(`[VipSubscriptionService] Automated 2-Days reminder dispatched to #${sub.accountNumber}`);
          } catch (e: any) {
            console.warn(`[VipSubscriptionService] Failed to send 2-days reminder to ${sub.accountNumber}:`, e.message);
          }
        }
      }
    }
    return { sentCount };
  }

  private reminderTimer: NodeJS.Timeout | null = null;

  /**
   * Starts background automated cron daemon to check and dispatch reminders periodically
   */
  public startAutomatedReminderDaemon(checkIntervalMs: number = 3600000): void {
    if (this.reminderTimer) return;
    console.log(`🔔 [VipSubscriptionService] Automated Customer Reminder Daemon started (Interval: ${checkIntervalMs / 60000} mins).`);
    
    // Initial check 15 seconds after server boot
    setTimeout(() => {
      this.checkAndDispatchAutomatedReminders().catch(err => {
        console.warn('[VipSubscriptionService] Initial automated reminder check failed:', err.message);
      });
    }, 15000);

    // Periodic checking
    this.reminderTimer = setInterval(() => {
      this.checkAndDispatchAutomatedReminders().catch(err => {
        console.warn('[VipSubscriptionService] Periodic automated reminder check failed:', err.message);
      });
    }, checkIntervalMs);

    if (this.reminderTimer.unref) {
      this.reminderTimer.unref();
    }
  }
}

export const vipSubscriptionService = VipSubscriptionService.getInstance();

