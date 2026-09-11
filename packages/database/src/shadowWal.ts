import fs from 'fs';
import path from 'path';
import { logger } from '@iati/core';
import { ActiveShadowObservation, LearningJournalEvent } from '../../types';

export type ShadowWalOperationType = 'SAVE_OBSERVATION' | 'UPDATE_OBSERVATION' | 'SAVE_JOURNAL_EVENT';
export type ShadowWalEntityType = 'SHADOW_OBSERVATION' | 'JOURNAL_EVENT';

export interface ShadowWalEntry {
  id: string;
  operationType: ShadowWalOperationType;
  entityType: ShadowWalEntityType;
  entityId: string;
  symbol?: string;
  payload: any;
  createdTimestamp: number;
  retryCount: number;
  version: number;
  checksum?: string;
}

export class ShadowWriteAheadLog {
  private static instance: ShadowWriteAheadLog;
  private walDir: string;

  public constructor(customWalDir?: string) {
    this.walDir = customWalDir || path.resolve(process.cwd(), 'data', 'shadow-write-ahead');
    this.ensureWalDir();
  }

  public static getInstance(customWalDir?: string): ShadowWriteAheadLog {
    if (!ShadowWriteAheadLog.instance) {
      ShadowWriteAheadLog.instance = new ShadowWriteAheadLog(customWalDir);
    }
    return ShadowWriteAheadLog.instance;
  }

  public setWalDir(dir: string): void {
    this.walDir = dir;
    this.ensureWalDir();
  }

  public getWalDir(): string {
    return this.walDir;
  }

  private ensureWalDir(): void {
    try {
      if (!fs.existsSync(this.walDir)) {
        fs.mkdirSync(this.walDir, { recursive: true });
      }
    } catch (err: any) {
      logger.error(`[ShadowWAL] Failed to initialize WAL directory: ${this.walDir}`, err);
    }
  }

  /**
   * Durably writes a WAL entry using atomic write (write to .tmp then rename).
   * Prevents partially written JSON or corruption during unexpected power/process failure.
   */
  public writeEntry(entry: {
    operationType: ShadowWalOperationType;
    entityType: ShadowWalEntityType;
    entityId: string;
    symbol?: string;
    payload: any;
  }): string | null {
    try {
      this.ensureWalDir();
      const walId = `wal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const fullEntry: ShadowWalEntry = {
        id: walId,
        operationType: entry.operationType,
        entityType: entry.entityType,
        entityId: entry.entityId,
        symbol: entry.symbol,
        payload: entry.payload,
        createdTimestamp: Date.now(),
        retryCount: 0,
        version: 1
      };

      const tempPath = path.join(this.walDir, `${walId}.tmp`);
      const finalPath = path.join(this.walDir, `${walId}.json`);

      fs.writeFileSync(tempPath, JSON.stringify(fullEntry, null, 2), 'utf8');
      fs.renameSync(tempPath, finalPath);

      return walId;
    } catch (err: any) {
      logger.error(`[ShadowWAL] Failed to write WAL entry for ${entry.entityId}: ${err?.message}`);
      return null;
    }
  }

  /**
   * Retrieves all pending, valid WAL entries ordered by createdTimestamp ASC.
   * Quarantines corrupted or unparseable files without crashing the process.
   */
  public getPendingEntries(): ShadowWalEntry[] {
    try {
      if (!fs.existsSync(this.walDir)) return [];
      const files = fs.readdirSync(this.walDir).filter(f => f.endsWith('.json'));
      const entries: ShadowWalEntry[] = [];

      for (const file of files) {
        const filePath = path.join(this.walDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const parsed = JSON.parse(content);
          if (parsed && parsed.id && parsed.operationType && parsed.entityId) {
            entries.push(parsed);
          } else {
            throw new Error('Missing required WAL fields');
          }
        } catch (err: any) {
          logger.warn(`[ShadowWAL] Corrupt WAL file encountered (${file}): ${err?.message} - quarantining.`);
          try {
            const corruptPath = path.join(this.walDir, `${file}.corrupt`);
            fs.renameSync(filePath, corruptPath);
          } catch {}
        }
      }

      return entries.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    } catch (err: any) {
      logger.error(`[ShadowWAL] Error reading pending entries from ${this.walDir}: ${err?.message}`);
      return [];
    }
  }

  /**
   * Returns the count of active pending WAL files.
   */
  public getPendingCount(): number {
    try {
      if (!fs.existsSync(this.walDir)) return 0;
      return fs.readdirSync(this.walDir).filter(f => f.endsWith('.json')).length;
    } catch {
      return 0;
    }
  }

  /**
   * Removes a successfully committed WAL entry file with retry for Windows lock resilience.
   */
  public removeEntry(walId: string): boolean {
    const filePath = path.join(this.walDir, `${walId}.json`);
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          return true;
        }
        return false;
      } catch (err: any) {
        if (attempt === 3) {
          logger.warn(`[ShadowWAL] Failed to remove WAL entry ${walId}: ${err?.message}`);
          return false;
        }
        // Brief busy-wait retry for Windows file handle release
        const start = Date.now();
        while (Date.now() - start < 15) {}
      }
    }
    return false;
  }

  /**
   * Clears all WAL entries (used in test setup/teardown).
   */
  public clearWal(): void {
    try {
      if (!fs.existsSync(this.walDir)) return;
      const files = fs.readdirSync(this.walDir);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(this.walDir, file));
        } catch {}
      }
    } catch (err: any) {
      logger.warn(`[ShadowWAL] Error clearing WAL dir: ${err?.message}`);
    }
  }
}

export const shadowWriteAheadLog = ShadowWriteAheadLog.getInstance();
