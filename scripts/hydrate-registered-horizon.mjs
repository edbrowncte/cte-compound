import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

const root=new URL("../",import.meta.url);
const hash=value=>createHash("sha256").update(value).digest("hex");

async function hydrate(manifestName,prefix){
  const manifest=JSON.parse(await readFile(new URL(`source-code/${manifestName}`,root),"utf8"));
  const parts=[];
  for(let index=0;index<manifest.part_count;index+=1){
    parts.push(await readFile(new URL(`source-code/${prefix}.gz.b64.part-${String(index).padStart(2,"0")}`,root),"utf8"));
  }
  const encoded=parts.join("");
  const label=prefix.toUpperCase().replaceAll("-","_");
  if(hash(encoded)!==manifest.encoded_sha256)throw new Error(`${label}_ENCODED_HASH_MISMATCH`);
  const archive=Buffer.from(encoded,"base64");
  if(hash(archive)!==manifest.archive_sha256)throw new Error(`${label}_ARCHIVE_HASH_MISMATCH`);
  const payload=gunzipSync(archive);
  if(hash(payload)!==manifest.payload_sha256)throw new Error(`${label}_PAYLOAD_HASH_MISMATCH`);
  const decoded=JSON.parse(payload.toString("utf8"));
  for(const[path,content]of Object.entries(decoded.files||{})){
    const expected=manifest.file_hashes?.[path];
    if(!expected||hash(content)!==expected)throw new Error(`${label}_FILE_HASH_MISMATCH:${path}`);
    const url=new URL(path,root);
    await mkdir(new URL("./",url),{recursive:true});
    await writeFile(url,content,"utf8");
  }
  return Object.keys(decoded.files||{}).length;
}

const sourceCount=await hydrate("registered-horizon.manifest.json","registered-horizon");
const implementationCount=await hydrate("registered-horizon-implementation.manifest.json","registered-horizon-implementation");
console.log(`Hydrated ${sourceCount+implementationCount} checksum-verified registered Horizon files.`);
