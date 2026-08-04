import { HtlEngine as HorizonEngine } from "./engine-horizon-base.js";
import { __platformTest, computeConfiguration as computePlatformConfiguration, optimizeNext as optimizePlatformNext, scan as scanPlatform, currentOptimizer, OPTIMIZER_VERSION, PAIRS } from "./horizon-platform-engine.js";
import "../public/htl-horizon-contract.js";
import "../public/horizon-strategy-contract.js";

const H=globalThis.CTE_HORIZON_HTL,S=globalThis.CTE_HORIZON_STRATEGIES;
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
export { __platformTest as __horizonTest };

export class HtlEngine extends HorizonEngine {
  async fetch(request) {
    const path=new URL(request.url).pathname;
    if(path==="/optimizer"&&request.method==="GET")return response({version:OPTIMIZER_VERSION,calculationVersion:H.VERSION,qualificationVersion:S.VERSION,records:currentOptimizer(await this.ctx.storage.get("optimizer"))});
    if(path==="/compute"&&request.method==="POST"){try{return response(await this.computeConfiguration(await request.json()));}catch(error){return response({error:String(error?.message||error),stage:error?.stage||"compute"},Number(error?.status)||500);}}
    if(path==="/manual-trade-action"&&request.method==="POST"){
      const entry=await request.json().catch(()=>null),allowed=new Set(["MANUAL_TRADE_CLOSE","MANUAL_TRADE_MODIFY","MANUAL_CANDIDATE_ORDER"]);
      if(!entry||!allowed.has(entry.type))return response({error:"Invalid manual trade action."},400);
      await this.write({...entry,calculationVersion:entry.calculationVersion||H.VERSION,qualificationVersion:entry.qualificationVersion||S.VERSION},false);return response({ok:true});
    }
    return super.fetch(request);
  }
  async tick(){const state=(await this.ctx.storage.get("state"))||{};if(state.qualificationVersion!==S.VERSION){Object.assign(state,{events:{},directions:null,requirements:null,lastCandle:null,mtf:{},mtfDecisionDirections:{},mtfRotation:0,initialized:false,calculationVersion:H.VERSION,qualificationVersion:S.VERSION});await this.ctx.storage.put("state",state);await this.write({type:"QUALIFICATION_MIGRATION",calculationVersion:H.VERSION,qualificationVersion:S.VERSION,message:"All strategies now qualify one canonical Asset/Inverse crossing clock"},false);}return super.tick();}
  async status(){const status=await super.status(),records=currentOptimizer(await this.ctx.storage.get("optimizer"));return{...status,optimizerVersion:OPTIMIZER_VERSION,optimizerCoverage:Object.keys(records).length,optimizerTotal:PAIRS.length*10,calculationVersion:H.VERSION,qualificationVersion:S.VERSION,crossingContract:"ONE_RAW_ASSET_RECOVERED_INVERSE_CROSSING_CLOCK",strategyContract:"POST_CROSS_STRATEGY_QUALIFICATION"};}
  async computeConfiguration(value){return computePlatformConfiguration(this,value);}
  async optimizeNext(state,token){return optimizePlatformNext(this,state,token);}
  async scan(token,config,timeframe=config.timeframe,optimizer={}){return scanPlatform(this,token,config,timeframe,optimizer);}
  mtfCandidates(state,rows,lastCandle,fingerprint){const byPair=new Map(rows.filter(row=>row.event?.qualified!==false&&row.event?.startTime===lastCandle).map(row=>[row.pair,row])),timeframes=["W","D","H4","H1","M30","M15","M5","M1","S30","S5"];return[...byPair.values()].map(row=>{let score=0,count=0;for(const timeframe of timeframes){const snapshot=state.mtf?.[timeframe];if(snapshot?.fingerprint!==fingerprint)continue;const direction=Number(snapshot.directions?.[row.pair]||0);if(direction){score+=direction;count++;}}const consensus=Math.sign(score);return consensus&&count>=3&&consensus===row.event.direction?{...row,confidence:Math.abs(score)/count,count}:null;}).filter(Boolean).sort((left,right)=>right.confidence-left.confidence||right.count-left.count);}
}
