import { AuditRecord } from '../types';
import { logger } from '@iati/core';

export class AuditLogger {
  private auditRecords: AuditRecord[] = [];

  logDecision(record: AuditRecord): void {
    // Immutable append
    this.auditRecords.push(Object.freeze({ ...record }));
    logger.info(`[RISK-AUDIT-LOG] Decision ID ${record.id}: ${record.final_decision} for Symbol ${record.symbol}. Reason: ${record.reason}`);
  }

  getAuditLogs(): AuditRecord[] {
    return [...this.auditRecords];
  }

  getAuditLogsByAccount(accountId: string): AuditRecord[] {
    return this.auditRecords.filter(r => r.account_id === accountId);
  }

  getAuditLogsByProposal(proposalId: string): AuditRecord | undefined {
    return this.auditRecords.find(r => r.proposal_id === proposalId);
  }
}
