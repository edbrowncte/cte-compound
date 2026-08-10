import { HtlEngine as NemotronEngine } from "./engine-nemotron-base.js";
import {
  __platformTest,
  computeConfiguration as computeRegisteredConfiguration,
  optimizeNext as optimizeRegisteredNext,
  scan as scanRegistered,
  loadOptimizerRecords,
  OPTIMIZER_VERSION,
  PAIRS,
  ANALYTICAL_CERTIFICATION,
} from "./horizon-platform-engine.js";
import { STRATEGY_ENGINE_VERSION } from "./horizon-strategy-v1.js";
import { REGISTERED_PERFORMANCE_VERSION } from "./horizon-registered-performance.js";

const LEGACY_QUALIFICATION_VERSION = "CTE_HORIZON_STRATEGY_QUALIFICATION@1.0.0";
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
export { __platformTest as __horizonTest };

export class HtlEngine extends NemotronEngine {
  async fetch(request){
    const path=new URL(request.url).pathname;
    if(path==="/optimizer"&&request.method==="GET")return response({version:OPTIMIZER_VERSION,strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION,analyticalCertification:ANALYTICAL_CERTIFICATION,records:await loadOptimizerRecords(this.ctx.storage)});
    if(path==="/compute"&&request.method==="POST"){try{return response(await this.computeConfiguration(await request.json()));}catch(error){return response({error:String(error?.message||error),stage:error?.stage||"compute"},Number(error?.status)||500);}}
    return super.fetch(request);
  }
  async tick(){
    const state=(await this.ctx.storage.get("state"))||{};
    if(state.strategyEngineVersion!==STRATEGY_ENGINE_VERSION){
      Object.assign(state,{events:{},directions:null,requirements:null,lastCandle:null,mtf:{},mtfDecisionDirections:{},mtfRotation:0,initialized:false,strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION,qualificationVersion:LEGACY_QUALIFICATION_VERSION,analyticalCertification:ANALYTICAL_CERTIFICATION});
      await this.ctx.storage.put("state",state);
      await this.write({type:"ANALYTICAL_ENGINE_MIGRATION",strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION,message:"Restored six independent registered CTE Horizon strategy state machines; saved 168-row historical certification remains pending exact 3,000-candle replay"},false);
    }
    return super.tick();
  }
  async status(){
    const status=await super.status(),records=await loadOptimizerRecords(this.ctx.storage);
    return{...status,armed:true,optimizerVersion:OPTIMIZER_VERSION,optimizerCoverage:Object.keys(records).length,optimizerTotal:PAIRS.length*10,strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION,strategyContract:"SIX_INDEPENDENT_REGISTERED_HORIZON_STATE_MACHINES",performanceContract:"3000_BAR_NEXT_OPEN_OPPOSITE_STRATEGY_EVENT_GROSS",analyticalCertification:ANALYTICAL_CERTIFICATION,executionCertification:"ARMED_PRIVATE_USER"};
  }
  async computeConfiguration(value){return computeRegisteredConfiguration(this,value);}
  async optimizeNext(state,token){return optimizeRegisteredNext(this,state,token);}
  async scan(token,config,timeframe=config.timeframe,optimizer={}){return scanRegistered(this,token,config,timeframe,optimizer);}
}
