import candidateWorker from "./worker-candidate-base.js";
export { HtlEngine } from "./engine.js";

async function injectFinalRuntime(response,url){
  const type=response.headers.get("Content-Type")||"";
  if(!(url.pathname==="/"||url.pathname.endsWith(".html")||type.includes("text/html")))return response;
  let html=await response.text();
  if(!html.includes("/platform-horizon-fixup.js"))html=html.replace("</body>",'  <script src="/platform-horizon-fixup.js"></script>\n</body>');
  const headers=new Headers(response.headers);headers.delete("Content-Length");headers.set("Cache-Control","no-store");
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    let forwarded=request;
    if(url.pathname==="/api/oanda/order"&&request.method==="POST"){
      const body=await request.clone().json().catch(()=>null);
      if(body?.cteContext?.crossingIdentity){
        body.cteContext={...body.cteContext,configuredStrategy:body.cteContext.strategy||"ASSET",strategy:body.cteContext.crossingStrategy||"ASSET"};
        forwarded=new Request(request,{body:JSON.stringify(body)});
      }
    }
    const response=await candidateWorker.fetch(forwarded,env,ctx);
    return injectFinalRuntime(response,url);
  },
  async scheduled(event,env,ctx){return candidateWorker.scheduled(event,env,ctx);}
};
