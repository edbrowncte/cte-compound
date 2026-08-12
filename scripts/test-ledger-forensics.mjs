import assert from "node:assert/strict";
import {buildForensicLedgerPayload,classifyLedgerRecord} from "../src/ledger-forensics.js";

const time="2026-08-05T12:00:00.000Z";
const auth={type:"ERROR",time,message:"Configured OANDA account 001 is not authorized or is an MT4-linked account"};
assert.equal(classifyLedgerRecord(auth).forensicClass,"AUTH_FRICTION");
assert.equal(classifyLedgerRecord({type:"ERROR",time,message:"Cannot access 'token3' before initialization"}).forensicClass,"CODE_RUNTIME");
assert.equal(classifyLedgerRecord({type:"NO_ORDER",time,message:"No margin available: 0"}).forensicClass,"CAPACITY_VETO");
assert.equal(classifyLedgerRecord({type:"NO_ORDER",time,message:"Existing position already matches event"}).forensicClass,"BENIGN_NOOP");
assert.equal(classifyLedgerRecord({type:"AI_FALLBACK",time,message:"Nemotron fallback"}).forensicClass,"AI_ORCHESTRATION");

const payload=buildForensicLedgerPayload({storageMode:"SHARDED_RECORDS",ledger:[
  auth,
  {...auth,ledgerId:"duplicate-auth"},
  {type:"OANDA_TRANSACTION",time:"2026-08-11T21:05:06Z",transaction:"36938",transactionType:"ORDER_FILL",pair:"EUR_USD",units:1800,price:1.15397,realizedPL:-0.468},
  {type:"POSITION_CLOSED",time:"2026-08-11T21:05:06Z",transaction:"36938",pair:"EUR_USD",units:1800,price:1.15397,realizedPL:-0.468},
  {type:"ORDER_FILLED",time:"2026-08-11T21:05:07Z",transaction:"36940",pair:"EUR_USD",units:1800,price:1.15397},
  {type:"NO_ORDER",time:"2026-08-11T21:06:00Z",pair:"EUR_USD",message:"No directional units available: 0"},
  {type:"NO_ORDER",time:"2026-08-11T21:07:00Z",pair:"EUR_USD",message:"Existing position already matches event"},
]});

assert.equal(payload.forensic.version,"CTE_LEDGER_FORENSICS@1.0.0");
assert.equal(payload.forensic.rawRecords,7);
assert.equal(payload.forensic.uniqueOperationalIncidents,2,"duplicate auth rows collapse to one incident while the capacity veto remains distinct");
assert.equal(payload.forensic.duplicateOperationalRows,1);
assert.equal(payload.forensic.canonicalEconomicEvents,2);
assert.equal(payload.forensic.duplicateEconomicReferences,1);
const transactionRows=payload.ledger.filter(row=>row.economicKey==="TX:36938");
assert.equal(transactionRows.find(row=>row.type==="OANDA_TRANSACTION").economicCountingStatus,"CANONICAL");
assert.equal(transactionRows.find(row=>row.type==="POSITION_CLOSED").economicCountingStatus,"DUPLICATE_REFERENCE");
assert.equal(payload.ledger.find(row=>row.type==="ORDER_FILLED").economicCountingStatus,"CANONICAL");
assert.equal(payload.ledger.find(row=>row.message==="Existing position already matches event").economicCountingStatus,"NON_ECONOMIC");
assert.match(payload.forensic.preservationRule,/not deleted or rewritten/i);

console.log("Derived ledger forensic classes, operational incident deduplication, and canonical economic counting verified.");
