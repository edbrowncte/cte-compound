import fs from "node:fs";

const path="scripts/test-forensic-connect-recovery.mjs";
let source=fs.readFileSync(path,"utf8"),changes=0;
const replace=(from,to,label)=>{if(!source.includes(from))throw new Error(`Missing forensic test anchor: ${label}`);source=source.replace(from,to);changes++;};

replace(
`  // One OANDA REST token can expose both accounts. Production resolves the unique non-MT4 -001 returned by OANDA and blocks -002.
  mode="success";calls=[];
  const configuredAlias="001-001-9999999-001";
  let response=await worker.fetch(browser("/api/oanda/connect"),envFor(configuredAlias));`,
`  const configuredAlias="001-001-9999999-001";

  // Before the resolver cache is warm, account inventory failure remains a staged production bootstrap failure.
  mode="list-network";calls=[];let response=await worker.fetch(browser("/api/oanda/connect"),envFor(configuredAlias));assert.equal(response.status,502);let payload=await response.json();assert.equal(payload.code,"OANDA_NETWORK_FAILURE");assert.equal(payload.stage,"ACCOUNT_LIST");assert.equal(payload.attempts,3);

  // One OANDA REST token can expose both accounts. Production resolves the unique non-MT4 -001 returned by OANDA and blocks -002.
  mode="success";calls=[];
  response=await worker.fetch(browser("/api/oanda/connect"),envFor(configuredAlias));`,
'cold resolver failure before success');

replace(
`  // Account-list failure is now the attributable production bootstrap failure because inventory is the proven working selection path.
  mode="list-network";calls=[];response=await worker.fetch(browser("/api/oanda/connect"),envFor(configuredAlias));assert.equal(response.status,502);payload=await response.json();assert.equal(payload.code,"OANDA_NETWORK_FAILURE");assert.equal(payload.stage,"ACCOUNT_LIST");assert.equal(payload.attempts,3);

`,
``,
'remove post-cache account-list assertion');

fs.writeFileSync(path,source);
console.log(`Ordered forensic resolver tests around cache warmup (${changes} transformations).`);
