#!/usr/bin/env node
import { verifyAuditLogIntegrity } from '../audit-logger.js';

(async () => {
  try {
    const res = await verifyAuditLogIntegrity();
    const msg = `[audit-verify] valid=${res.valid} invalid=${res.invalid} total=${res.total}`;
    // eslint-disable-next-line no-console
    console.log(msg);
    if (res.invalid > 0) {
      process.exitCode = 2;
    }
  } catch (err) {
    console.error('[audit-verify] failed', err);
    process.exit(1);
  }
})();

