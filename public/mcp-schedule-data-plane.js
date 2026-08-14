(()=>{
  "use strict";
  const VERSION="CTE_COMPOUND_MCP_SCHEDULE_CLIENT@1.0.0",CACHE_MS=4000;
  let snapshot=null,inflight=null,key="",loadedAt=0;
  const normalize=value=>String(value||"").trim().toUpperCase().replace(/[\s/-]+/g,"_");
  async function callTool(strategies){
    const response=await fetch("/mcp",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},credentials:"same-origin",cache:"no-store",body:JSON.stringify({jsonrpc:"2.0",id:`schedule-${Date.now()}`,method:"tools/call",params:{name:"get_compound_schedule",arguments:{strategies}}})});
    const envelope=await response.json().catch(()=>null);
    if(!response.ok||envelope?.error)throw new Error(envelope?.error?.message||`MCP schedule HTTP ${response.status}`);
    const text=envelope?.result?.content?.find?.(item=>item?.type==="text")?.text;
    if(!text)throw new Error("MCP schedule returned no text content");
    const payload=JSON.parse(text);
    payload.rowMap=new Map((payload.rows||[]).map(row=>[`${row.pair}|${row.timeframe}`,row]));
    return payload;
  }
  async function prime(...requested){
    const strategies=[...new Set(requested.flat().map(normalize).filter(Boolean))];if(!strategies.includes("ASSET"))strategies.unshift("ASSET");
    const nextKey=strategies.sort().join(","),now=Date.now();
    if(snapshot&&key===nextKey&&now-loadedAt<CACHE_MS)return snapshot;
    if(inflight&&key===nextKey)return inflight;
    key=nextKey;inflight=callTool(strategies).then(value=>{snapshot=value;loadedAt=Date.now();return value;}).finally(()=>{inflight=null;});return inflight;
  }
  function get(pair,timeframe){return snapshot?.rowMap?.get?.(`${pair}|${timeframe}`)||null;}
  function status(){return{version:VERSION,loadedAt:loadedAt?new Date(loadedAt).toISOString():null,key,coverage:Number(snapshot?.coverage)||0,total:Number(snapshot?.total)||0,failures:Number(snapshot?.failureCount)||0};}
  globalThis.CTECompoundMcpSchedule=Object.freeze({version:VERSION,prime,get,status});
})();
