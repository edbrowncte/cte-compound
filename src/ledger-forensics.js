const AUTH_PATTERN=/(not authorized|unauthori[sz]ed|authorization|mt4|account .*not .*authorized|authorized non-mt4 account|credentials? unavailable)/i;
const RUNTIME_PATTERN=/(cannot access .* before initialization|before initialization|referenceerror|token3|temporal dead zone|is not defined|undefined variable)/i;
const CAPACITY_PATTERN=/(no margin|margin available|directional units|units available|capacity|scaled units to 0|below minimum units)/i;
const BENIGN_PATTERN=/(already matches|duplicate submission suppressed|already .* position|no new .*event|waiting only for opposite|recovered; duplicate|hold\b)/i;
const ECONOMIC_TYPES=new Set(["ORDER_FILLED","POSITION_CLOSED","OANDA_TRANSACTION"]);
const OPERATIONAL_CLASSES=new Set(["AUTH_FRICTION","CODE_RUNTIME","BROKER_EXECUTION","CAPACITY_VETO"]);

function stableText(value){return String(value||"").trim().replace(/\s+/g," ").toLowerCase();}
function secondStamp(value){const time=Date.parse(value||"");return Number.isFinite(time)?new Date(Math.floor(time/1000)*1000).toISOString():"NO_TIME";}
function hasEconomicPayload(record){
  if(!ECONOMIC_TYPES.has(String(record?.type||"")))return false;
  if(record.type!=="OANDA_TRANSACTION")return true;
  return record.realizedPL!==null&&record.realizedPL!==undefined||record.financing!==null&&record.financing!==undefined||record.commission!==null&&record.commission!==undefined||record.units!==null&&record.units!==undefined&&record.price!==null&&record.price!==undefined;
}
function economicKey(record){
  if(!hasEconomicPayload(record))return null;
  if(record?.transaction)return `TX:${record.transaction}`;
  if(record?.clientOrderId)return `CLIENT:${record.clientOrderId}`;
  if(record?.event&&record?.pair)return `EVENT:${record.pair}:${record.event}:${record.type}`;
  return null;
}
function forensicClass(record){
  const type=String(record?.type||"UNKNOWN"),message=String(record?.message||record?.reason||"");
  if(type==="ERROR"&&AUTH_PATTERN.test(message))return "AUTH_FRICTION";
  if(type==="ERROR"&&RUNTIME_PATTERN.test(message))return "CODE_RUNTIME";
  if(type==="NO_ORDER"&&CAPACITY_PATTERN.test(message))return "CAPACITY_VETO";
  if(type==="NO_ORDER"&&BENIGN_PATTERN.test(message))return "BENIGN_NOOP";
  if(hasEconomicPayload(record))return "ECONOMIC_EVENT";
  if(type==="CLOSE_REJECTED"||type==="CLOSE_RETRY_EXHAUSTED"||type==="REVERSAL_RETRY_PENDING"||/REJECT|RETRY|ORDER_RECONCILED/.test(type))return "BROKER_EXECUTION";
  if(type==="AI_DECISION"||type==="AI_FALLBACK")return "AI_ORCHESTRATION";
  if(type==="NO_ORDER")return "EXECUTION_VETO";
  if(type==="ERROR")return "CODE_RUNTIME";
  return "OPERATIONAL_EVENT";
}
function incidentKey(record,klass){
  if(!OPERATIONAL_CLASSES.has(klass))return null;
  return `${klass}|${secondStamp(record?.time)}|${stableText(record?.pair)}|${stableText(record?.message||record?.reason)}`;
}
function economicPriority(record){
  if(record?.type==="OANDA_TRANSACTION")return 4;
  if(record?.type==="POSITION_CLOSED")return 3;
  if(record?.type==="ORDER_FILLED")return 2;
  return 1;
}

export function classifyLedgerRecord(record={}){
  const klass=forensicClass(record),key=economicKey(record);
  return{
    ...record,
    forensicClass:klass,
    operationalIncidentKey:incidentKey(record,klass),
    economicKey:key,
    economicCountingStatus:key?"PENDING":"NON_ECONOMIC",
  };
}

export function buildForensicLedgerPayload(payload={}){
  const ledger=(Array.isArray(payload?.ledger)?payload.ledger:[]).map(classifyLedgerRecord);
  const groups=new Map();
  for(let index=0;index<ledger.length;index++){
    const key=ledger[index].economicKey;
    if(!key)continue;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(index);
  }
  let canonicalEconomicEvents=0,duplicateEconomicReferences=0;
  for(const indexes of groups.values()){
    const canonical=[...indexes].sort((a,b)=>economicPriority(ledger[b])-economicPriority(ledger[a])||a-b)[0];
    canonicalEconomicEvents++;
    for(const index of indexes){
      ledger[index]={...ledger[index],economicCountingStatus:index===canonical?"CANONICAL":"DUPLICATE_REFERENCE"};
      if(index!==canonical)duplicateEconomicReferences++;
    }
  }
  for(let index=0;index<ledger.length;index++){
    if(ledger[index].forensicClass==="ECONOMIC_EVENT"&&!ledger[index].economicKey){
      ledger[index]={...ledger[index],economicCountingStatus:"CANONICAL_UNKEYED"};
      canonicalEconomicEvents++;
    }
  }
  const incidentRows=ledger.filter(record=>record.operationalIncidentKey),uniqueIncidents=new Set(incidentRows.map(record=>record.operationalIncidentKey));
  const classCounts={};for(const record of ledger)classCounts[record.forensicClass]=(classCounts[record.forensicClass]||0)+1;
  return{
    ...payload,
    ledger,
    forensic:{
      version:"CTE_LEDGER_FORENSICS@1.0.0",
      rawRecords:ledger.length,
      classCounts,
      operationalIncidentRows:incidentRows.length,
      uniqueOperationalIncidents:uniqueIncidents.size,
      duplicateOperationalRows:incidentRows.length-uniqueIncidents.size,
      canonicalEconomicEvents,
      duplicateEconomicReferences,
      accountingRule:"One canonical economic record per broker transaction; OANDA_TRANSACTION is preferred when the same transaction is represented by multiple journal rows.",
      preservationRule:"Raw ledger storage is not deleted or rewritten; classification and deduplication are derived metadata.",
    }
  };
}

export const __ledgerForensicTest=Object.freeze({forensicClass,economicKey,incidentKey,economicPriority,hasEconomicPayload});
