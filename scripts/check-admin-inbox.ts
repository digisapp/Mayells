// Prints whether /admin/emails can receive mail right now (same check as
// GET /api/admin/emails/status), read-only against Resend. Run with:
//   npx tsx scripts/check-admin-inbox.ts
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { getInboxStatus } = await import('../src/lib/email/inbox-status');
  const s = await getInboxStatus({ fresh: true });
  const domainLine = (d: typeof s.domain) => (d.found ? `${d.status}, sending ${d.sending}, receiving ${d.receiving}` : 'NOT IN RESEND');
  console.log(`Inbox address : ${s.inboundAddress}`);
  console.log(`Replies from  : ${s.from}`);
  console.log(`Forward copy  : ${s.forwardTo}`);
  console.log(`Domain        : ${s.domain.name} → ${domainLine(s.domain)}`);
  for (const r of s.domain.records) {
    console.log(`  ${r.status.padEnd(9)} ${r.record.padEnd(9)} ${r.type.padEnd(5)} ${r.host.padEnd(24)} ${String(r.priority ?? '').padEnd(3)} ${r.value.slice(0, 60)}`);
  }
  if (s.fromDomain) console.log(`From domain   : ${s.fromDomain.name} → ${domainLine(s.fromDomain)}`);
  console.log(`Webhook       : ${s.webhook.endpoint ?? 'none'} (${s.webhook.status ?? '-'}; canonical=${s.webhook.canonical}; received=${s.webhook.hasReceivedEvent}; events=${s.webhook.events.join(',') || '-'})`);
  console.log(`Env           : apiKey=${s.env.resendApiKey} webhookSecret=${s.env.webhookSecret} ai=${s.env.aiKey} (${s.env.aiProvider})`);
  console.log(`READY         : ${s.ready}`);
  if (s.problems.length) {
    console.log('Problems:');
    s.problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  }
  if (s.warnings.length) {
    console.log('Warnings:');
    s.warnings.forEach((w) => console.log(`  - ${w}`));
  }
  process.exit(s.ready ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
