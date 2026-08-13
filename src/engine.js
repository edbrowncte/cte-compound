import { HtlEngine as NemotronEngine } from "./engine-nemotron-base.js";
import {
  __platformTest,
  computeConfiguration as computeRegisteredConfiguration,
  optimizeNext as optimizeRegisteredNext,
  scan as scanRegistered,
  loadOptimizerRecords,
  OPTIMIZER_VERSION,
  PAIRS,
  TIMEFRAMES,
  ANALYTICAL_CERTIFICATION,
} from "./horizon-platform-engine.js";
import { STRATEGY_ENGINE_VERSION } from "./horizon-strategy-v1.js";
import { REGISTERED_PERFORMANCE_VERSION } from "./horizon-registered-performance.js";

const LEGACY_QUALIFICATION_VERSION = "CTE_HORIZON_STRATEGY_QUALIFICATION@1.0.0";
const EXECUTION_OBSERVABILITY_VERSION="EXECUTION_MODE_OBSERVABILITY@1.0.0";
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
export { __platformTest as __horizonTest };

function activeIndicatorTickets(state={}){
  const tickets=Array.isArray(state.indicatorOnlyTickets)?state.indicatorOnlyTickets.filter(ticket=>ticket?.enabled):[];
  if(tickets.length)return tickets;
  if(state.indicatorOnly?.enabled)return[{slot:1,...state.indicatorOnly,units:state.indicatorOnlyUnits??state.indicatorOnly?.units??null}];
  return[];
}
function latestLaneCandle(lanes=[]){
  const values=lanes.map(lane=>lane?.lastCandle).filter(Boolean);
  if(!values.length)return null;
  return values.sort((left,right)=>Date.parse(right)-Date.parse(left))[0]||null;
}
function executionObservability(status={},state={}){
  const tickets=activeIndicatorTickets(state),runtime=state.indicatorOnlyTicketRuntime||{},lanes=tickets.map((ticket,index)=>{
    const slot=Number(ticket.slot)||index+1,lane=runtime[slot]||runtime[String(slot)]||{};
    return{mode:"INDICATOR_ONLY",slot,pair:ticket.pair||null,timeframe:ticket.timeframe||null,indicator:ticket.indicator||null,length:Number(ticket.length)||null,filter:Number(ticket.filter)||0,units:Number(ticket.units)||null,lastCandle:lane.lastCandle||null,lastSignal:lane.lastSignal||null,lastSignalAt:lane.lastSignalAt||null,lastEventId:lane.lastEventId||null,lastExecutionEventId:lane.lastExecutionEventId||null,lastExecutionAt:lane.lastExecutionAt||null,lastError:lane.lastError||null};
  });
  if(!lanes.length)lanes.push({mode:"NORMAL",slot:null,pair:"EUR_USD",timeframe:status.timeframe||null,indicator:status.strategy||null,length:status.htlLength??null,filter:status.filter??null,units:null,lastCandle:status.lastCandle||null,lastSignal:null,lastSignalAt:null,lastEventId:null,lastExecutionEventId:null,lastExecutionAt:null,lastError:status.lastError||null});
  const activeExecutionLastCandle=latestLaneCandle(lanes),executionMode=tickets.length===0?"NORMAL":tickets.length===1?`INDICATOR_ONLY_TICKET_${Number(tickets[0].slot)||1}`:"INDICATOR_ONLY_DUAL";
  return{executionObservabilityVersion:EXECUTION_OBSERVABILITY_VERSION,executionMode,activeExecutionLaneCount:lanes.length,executionLanes:lanes,normalEngineLastCandle:status.lastCandle||null,activeExecutionLastCandle,lastCandle:activeExecutionLastCandle||status.lastCandle||null};
}
export const __executionStatusTest=Object.freeze({EXECUTION_OBSERVABILITY_VERSION,activeIndicatorTickets,latestLaneCandle,executionObservability});

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
    const status=await super.status(),records=await loadOptimizerRecords(this.ctx.storage),state=(await this.ctx.storage.get("state"))||{},base={...status,armed:true,optimizerVersion:OPTIMIZER_VERSION,optimizerCoverage:Object.keys(records).length,optimizerTotal:PAIRS.length*TIMEFRAMES.length,strategyEngineVersion:STRATEGY_ENGINE_VERSION,performanceVersion:REGISTERED_PERFORMANCE_VERSION,strategyContract:"SIX_INDEPENDENT_REGISTERED_HORIZON_STATE_MACHINES",performanceContract:"3000_BAR_NEXT_OPEN_OPPOSITE_STRATEGY_EVENT_GROSS",analyticalCertification:ANALYTICAL_CERTIFICATION,executionCertification:"ARMED_PRIVATE_USER"};
    return{...base,...executionObservability(base,state)};
  }
  async computeConfiguration(value){return computeRegisteredConfiguration(this,value);}
  async optimizeNext(state,token){return optimizeRegisteredNext(this,state,token);}
  async scan(token,config,timeframe=config.timeframe,optimizer={}){return scanRegistered(this,token,config,timeframe,optimizer);}
}