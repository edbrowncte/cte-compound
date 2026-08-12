import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { readFile, writeFile, rm } from "node:fs/promises";

const root=new URL("../",import.meta.url);
const manifestUrl=new URL("source-code/registered-horizon-implementation.manifest.json",root);
const prefix="registered-horizon-implementation.gz.b64.part-";
const hash=value=>createHash("sha256").update(value).digest("hex");
const manifest=JSON.parse(await readFile(manifestUrl,"utf8"));
const parts=[];
for(let index=0;index<manifest.part_count;index++)parts.push(await readFile(new URL(`source-code/${prefix}${String(index).padStart(2,"0")}`,root),"utf8"));
const archive=Buffer.from(parts.join(""),"base64"),decoded=JSON.parse(gunzipSync(archive).toString("utf8"));

for(const path of ["src/horizon-platform-engine.js","src/engine.js"]){
  if(!(path in decoded.files))throw new Error(`Certified implementation archive does not contain ${path}`);
  decoded.files[path]=await readFile(new URL(path,root),"utf8");
}

const payload=Buffer.from(JSON.stringify(decoded),"utf8"),nextArchive=gzipSync(payload,{level:9}),encoded=nextArchive.toString("base64"),nextParts=[];
for(let start=0;start<encoded.length;start+=6000)nextParts.push(encoded.slice(start,start+6000));
for(let index=0;index<nextParts.length;index++)await writeFile(new URL(`source-code/${prefix}${String(index).padStart(2,"0")}`,root),nextParts[index],"utf8");
for(let index=nextParts.length;index<manifest.part_count;index++)await rm(new URL(`source-code/${prefix}${String(index).padStart(2,"0")}`,root));

const fileHashes=Object.fromEntries(Object.entries(decoded.files).map(([path,content])=>[path,hash(content)]));
const nextManifest={...manifest,payload_sha256:hash(payload),archive_sha256:hash(nextArchive),encoded_sha256:hash(encoded),part_count:nextParts.length,file_hashes:fileHashes};
await writeFile(manifestUrl,`${JSON.stringify(nextManifest,null,2)}\n`,"utf8");

const verificationParts=[];
for(let index=0;index<nextManifest.part_count;index++)verificationParts.push(await readFile(new URL(`source-code/${prefix}${String(index).padStart(2,"0")}`,root),"utf8"));
const verificationEncoded=verificationParts.join(""),verificationArchive=Buffer.from(verificationEncoded,"base64"),verificationPayload=gunzipSync(verificationArchive),verificationDecoded=JSON.parse(verificationPayload.toString("utf8"));
if(hash(verificationEncoded)!==nextManifest.encoded_sha256||hash(verificationArchive)!==nextManifest.archive_sha256||hash(verificationPayload)!==nextManifest.payload_sha256)throw new Error("Certified implementation archive hash verification failed");
for(const [path,content] of Object.entries(verificationDecoded.files)){if(hash(content)!==nextManifest.file_hashes[path])throw new Error(`Certified file hash verification failed: ${path}`);}
if(!verificationDecoded.files["src/horizon-platform-engine.js"].includes('"H4","H2","H1"'))throw new Error("Certified platform registry does not contain H2");
if(!verificationDecoded.files["src/engine.js"].includes("PAIRS.length*TIMEFRAMES.length"))throw new Error("Certified engine optimizer total does not use the shared timeframe registry");
console.log(`Refreshed certified registered Horizon implementation archive: ${Object.keys(verificationDecoded.files).length} files, ${nextParts.length} parts.`);
