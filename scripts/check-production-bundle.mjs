import {execFile} from "node:child_process";
import {mkdtemp,readFile,readdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";

const execFileAsync=promisify(execFile);
const outdir=await mkdtemp(join(tmpdir(),"cte-compound-production-bundle-"));
try{
  const executable=fileURLToPath(new URL(process.platform==="win32"?"../node_modules/.bin/wrangler.cmd":"../node_modules/.bin/wrangler",import.meta.url));
  await execFileAsync(executable,["deploy","--dry-run","--outdir",outdir],{cwd:new URL("..",import.meta.url),maxBuffer:10*1024*1024});
  const files=await readdir(outdir,{recursive:true});
  const javascript=files.filter(file=>/\.m?js$/.test(file));
  if(!javascript.length)throw new Error("Wrangler dry-run produced no JavaScript bundle.");
  const bundle=(await Promise.all(javascript.map(file=>readFile(join(outdir,file),"utf8")))).join("\n");
  if(/storage\.put\(\s*["']optimizer["']/.test(bundle))throw new Error("Production bundle contains a forbidden monolithic optimizer registry write.");
  if(!/optimizer:v/.test(bundle))throw new Error("Production bundle is missing versioned sharded optimizer record keys.");
  if(!/SHARDED_PER_DATASET/.test(bundle))throw new Error("Production bundle is missing the sharded optimizer health contract.");
  if(!/CTE_COMPOUND_CURRENT_RELEASE@2\.0\.0/.test(bundle)||!/LEGACY_RELEASE_REJECTED/.test(bundle))throw new Error("Production bundle is missing the fail-closed current-release authority contract.");
  if(/CTE_COMPOUND_CAPITALIZATION_CHARTS@1\.0\.0/.test(bundle))throw new Error("Production bundle contains the obsolete chart-era release contract.");
  console.log("Production bundle contains only the sharded optimizer persistence contract and fails closed against unidentified legacy releases.");
}finally{
  await rm(outdir,{recursive:true,force:true});
}
