// Broker membership wins; local metadata only enriches the same ticket.
export function masterPositionSnapshot(local: any[], snapshot: any): any[] {
  if (snapshot?.success !== true || !Array.isArray(snapshot.normalizedPositions)) return local;
  const metadata = new Map(local.map(t => [String(t.brokerTicket || t.positionId || t.id?.replace(/^trade_/, '')), t]));
  return snapshot.normalizedPositions.map((p: any) => ({...(metadata.get(p.positionId) || {}), ...p}));
}
