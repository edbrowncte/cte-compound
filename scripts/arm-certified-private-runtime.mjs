import {readFile,writeFile,rm} from "node:fs/promises";
import {createHash} from "node:crypto";
import {gzipSync} from "node:zlib";

const root=new URL("../",import.meta.url);
const hash=value=>createHash("sha256").update(value).digest("hex");
const replaceOnce=(source,from,to,label)=>{
  const index=source.indexOf(from);
  if(index<0)throw new Error(`MISSING_ARMING_BOUNDARY:${label}`);
  if(source.indexOf(from,index+from.length)>=0)throw new Error(`NON_UNIQUE_ARMING_BOUNDARY:${label}`);
  return source.slice(0,index)+to+source.slice(index+from.length);
};
const removeClassMethod=(source,name,requiredTokens=[])=>{
  const marker=new RegExp(`\\n  async ${name}\\(`);
  const match=marker.exec(source);
  if(!match)throw new Error(`MISSING_CLASS_METHOD:${name}`);
  const nextMethod=/\n  (?:async )?[A-Za-z_$][\w$]*\(/g;
  nextMethod.lastIndex=match.index+match[0].length;
  const next=nextMethod.exec(source);
  if(!next)throw new Error(`MISSING_NEXT_CLASS_METHOD_AFTER:${name}`);
  const method=source.slice(match.index,next.index);
  for(const token of requiredTokens)if(!method.includes(token))throw new Error(`MISSING_${name.toUpperCase()}_TOKEN:${token}`);
  return source.slice(0,match.index)+source.slice(next.index);
};

const enginePath=new URL("src/engine.js",root);
let engine=await readFile(enginePath,"utf8");
const alreadyArmed=engine.includes("armed:true")&&engine.includes('executionCertification:"ARMED_PRIVATE_USER"')&&!engine.includes("PENDING_USER_DEPLOYMENT_APPROVAL");
if(!alreadyArmed){
  engine=replaceOnce(engine,"armed:false","armed:true","ARMED_STATUS");
  engine=replaceOnce(engine,'executionCertification:"BLOCKED_PENDING_USER_DEPLOYMENT_APPROVAL"','executionCertification:"ARMED_PRIVATE_USER"',"EXECUTION_CERTIFICATION");
  engine=removeClassMethod(engine,"reconcile",["ANALYTICAL_CERTIFICATION_BLOCK","PENDING_USER_DEPLOYMENT_APPROVAL"]);
  engine=removeClassMethod(engine,"execute",["ANALYTICAL_CERTIFICATION_BLOCK","PENDING_USER_DEPLOYMENT_APPROVAL"]);
  if(/BLOCKED_PENDING_|ANALYTICAL_CERTIFICATION_BLOCK|PENDING_USER_DEPLOYMENT_APPROVAL/.test(engine))throw new Error("PRIVATE_RUNTIME_REMAINS_BLOCKED");
  await writeFile(enginePath,engine,"utf8");

  const checkerPath=new URL("scripts/check-worker.mjs",root);
  let checker=await readFile(checkerPath,"utf8");
  checker=replaceOnce(
    checker,
    '[/BLOCKED_PENDING_USER_DEPLOYMENT_APPROVAL/,"execution certification block"]',
    '[/armed:true/,"armed private runtime"],[/executionCertification:"ARMED_PRIVATE_USER"/,"private execution certification"]',
    "WORKER_CHECKER_ARMING",
  );
  await writeFile(checkerPath,checker,"utf8");
}

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
console.log(JSON.stringify({armed:true,executionCertification:"ARMED_PRIVATE_USER",payload_sha256:manifest.payload_sha256,archive_sha256:manifest.archive_sha256,encoded_sha256:manifest.encoded_sha256,part_count:manifest.part_count,file_hashes:manifest.file_hashes},null,2));
