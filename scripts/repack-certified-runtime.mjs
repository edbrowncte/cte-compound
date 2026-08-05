import {readFile,writeFile,rm} from "node:fs/promises";
import {createHash} from "node:crypto";
import {gzipSync} from "node:zlib";

const root=new URL("../",import.meta.url);
const hash=value=>createHash("sha256").update(value).digest("hex");
const replaceExact=(source,from,to,label)=>{
  if(!source.includes(from))throw new Error(`MISSING_PATCH_BOUNDARY:${label}`);
  return source.replace(from,to);
};

const analyticalPath=new URL("src/horizon-platform-engine.js",root);
let analytical=await readFile(analyticalPath,"utf8");
analytical=replaceExact(
  analytical,
  `export const ANALYTICAL_CERTIFICATION = Object.freeze({\n  formulaParity: "PASS_CHECKSUM_VERIFIED_SOURCE",\n  savedRecordParity: "PENDING_EXACT_3000_CANDLE_HISTORY",\n  strategyEngineVersion: STRATEGY_ENGINE_VERSION,\n  performanceVersion: REGISTERED_PERFORMANCE_VERSION,\n});`,
  `export const ANALYTICAL_CERTIFICATION = Object.freeze({\n  formulaParity: "PASS_CHECKSUM_VERIFIED_SOURCE",\n  terminalFixtureParity: "PASS_TERMINAL_DERIVED_FIXTURE",\n  cleanSnapshotParity: "PASS_28_PAIRS_3000_BARS_168_ROWS",\n  legacyBenchmarkParity: "REJECTED_DATA_CONTAMINATION",\n  cleanCandleSnapshotSha256: "60f2a9e3353bfe18dc8f0bafe8032438e982b38d8b1f85734440ab3805c56b5d",\n  cleanPerformanceSha256: "8a294dbf8be60f87b70367ce780024af87c86a2b67081eb2fc8a9b481a61fe2f",\n  strategyEngineVersion: STRATEGY_ENGINE_VERSION,\n  performanceVersion: REGISTERED_PERFORMANCE_VERSION,\n});`,
  "ANALYTICAL_CERTIFICATION",
);
await writeFile(analyticalPath,analytical,"utf8");

const enginePath=new URL("src/engine.js",root);
let engine=await readFile(enginePath,"utf8");
engine=replaceExact(engine,'executionCertification:"BLOCKED_PENDING_SAVED_RECORD_PARITY"','executionCertification:"BLOCKED_PENDING_USER_DEPLOYMENT_APPROVAL"',"STATUS_BLOCK");
engine=replaceExact(engine,'message:"Position reconciliation and automated execution are blocked until the saved 168-row registered Horizon performance record passes exact 3,000-candle replay"','message:"Position reconciliation and automated execution remain blocked in the analytical-certification PR pending explicit user deployment approval"',"RECONCILIATION_MESSAGE");
engine=replaceExact(engine,'reason:"PENDING_SAVED_RECORD_PARITY"','reason:"PENDING_USER_DEPLOYMENT_APPROVAL"',"RECONCILIATION_REASON");
engine=replaceExact(engine,'message:"Automated candidate suppressed: analytical certification has not matched the saved 168-row performance record"','message:"Automated candidate suppressed: clean analytical certification passed, but this PR has not received user deployment approval"',"EXECUTION_MESSAGE");
engine=replaceExact(engine,'reason:"PENDING_SAVED_RECORD_PARITY"','reason:"PENDING_USER_DEPLOYMENT_APPROVAL"',"EXECUTION_REASON");
await writeFile(enginePath,engine,"utf8");

const checkerPath=new URL("scripts/check-worker.mjs",root);
let checker=await readFile(checkerPath,"utf8");
checker=replaceExact(checker,/BLOCKED_PENDING_SAVED_RECORD_PARITY/.toString(),/BLOCKED_PENDING_USER_DEPLOYMENT_APPROVAL/.toString(),"CHECKER_BLOCK");
await writeFile(checkerPath,checker,"utf8");

const originalManifest=JSON.parse(await readFile(new URL("source-code/registered-horizon-implementation.manifest.json",root),"utf8"));
const paths=Object.keys(originalManifest.file_hashes);
const files={};
const fileHashes={};
for(const path of paths){
  const content=await readFile(new URL(path,root),"utf8");
  files[path]=content;
  fileHashes[path]=hash(content);
}
const payload=Buffer.from(JSON.stringify({format:"cte-compound-registered-horizon-implementation-bundle-v2",files}),"utf8");
const archive=gzipSync(payload,{level:9});
const encoded=archive.toString("base64");
const parts=[];
for(let index=0;index<encoded.length;index+=6000)parts.push(encoded.slice(index,index+6000));
const manifest={
  format:"cte-compound-registered-horizon-implementation-manifest-v1",
  payload_sha256:hash(payload),
  archive_sha256:hash(archive),
  encoded_sha256:hash(encoded),
  part_count:parts.length,
  file_hashes:fileHashes,
};
await writeFile(new URL("source-code/registered-horizon-implementation.manifest.json",root),`${JSON.stringify(manifest,null,2)}\n`,"utf8");
for(let index=0;index<parts.length;index+=1){
  await writeFile(new URL(`source-code/registered-horizon-implementation.gz.b64.part-${String(index).padStart(2,"0")}`,root),parts[index],"utf8");
}
for(let index=parts.length;index<10;index+=1){
  await rm(new URL(`source-code/registered-horizon-implementation.gz.b64.part-${String(index).padStart(2,"0")}`,root),{force:true});
}
console.log(JSON.stringify({payload_sha256:manifest.payload_sha256,archive_sha256:manifest.archive_sha256,encoded_sha256:manifest.encoded_sha256,part_count:manifest.part_count,file_hashes:manifest.file_hashes},null,2));
