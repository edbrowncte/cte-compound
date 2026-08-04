import horizonWorker from "./worker-horizon-base.js";
import { handleCandidateOrder, __candidateTest } from "./horizon-candidate-orders.js";
export { HtlEngine } from "./engine.js";
export { __candidateTest };

const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
function assertSameOrigin(request){const url=new URL(request.url),origin=request.headers.get("Origin"),site=request.headers.get("Sec-Fetch-Site");if(origin&&origin!==url.origin)throw Object.assign(new Error("Cross-origin request rejected."),{status:403});if(!origin&&!site)throw Object.assign(new Error("Browser-origin request required."),{status:403});if(site&&!['same-origin','same-site','none'].includes(site))throw Object.assign(new Error("Cross-site request rejected."),{status:403});}
async function injectPlatformContracts(response,url){const type=response.headers.get("Content-Type")||"";if(!(url.pathname==="/"||url.pathname.endsWith(".html")||type.includes("text/html")))return response;let html=await response.text();html=html.replace('<script src="/platform-horizon-runtime.js"></script>','<script src="/horizon-strategy-contract.js"></script>\n  <script src="/platform-horizon-runtime.js"></script>\n  <script src="/platform-horizon-qualified-direction.js"></script>\n  <script src="/platform-horizon-candidate-context.js"></script>\n  <script src="/platform-horizon-execution-guard.js"></script>');const responseHeaders=new Headers(response.headers);responseHeaders.delete("Content-Length");responseHeaders.set("Cache-Control","no-store");return new Response(html,{status:response.status,statusText:response.statusText,headers:responseHeaders});}

export default{
  async fetch(request,env,ctx){const url=new URL(request.url);if(url.pathname==="/api/oanda/order"&&request.method==="POST"){const body=await request.clone().json().catch(()=>null);if(body?.cteContext){try{assertSameOrigin(request);return json(await handleCandidateOrder(request,env));}catch(error){return json({error:error?.message||"Candidate order failed.",details:error?.payload||undefined},Number(error?.status)||500);}}}return injectPlatformContracts(await horizonWorker.fetch(request,env,ctx),url);},
  async scheduled(event,env,ctx){return horizonWorker.scheduled(event,env,ctx);}
};
