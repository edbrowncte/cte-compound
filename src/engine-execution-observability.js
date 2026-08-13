import { __indicatorOnlyDualTest } from "./engine-indicator-only-dual.js";
import { __indicatorOnlyTest } from "./engine-indicator-only.js";

const EXECUTION_OBSERVABILITY_VERSION="EXECUTION_MODE_OBSERVABILITY@1.0.0";

function latestCandle(lanes=[]){
  const values=lanes.map(lane=>lane?.lastCandle).filter(Boolean);
  if(!values.length)return null;
  return values.sort((left,right)=>Date.parse(right)-Date.parse(left))[0]||null;
}

export function executionSnapshot(parent={},state={}){
  const tickets=__indicatorOnlyDualTest.normalizeTickets(state.indicatorOnlyTickets,state),active=tickets.filter(ticket=>ticket.enabled),runtime=state.indicatorOnlyTicketRuntime||{},legacy=__indicatorOnlyTest.normalizeIndicatorOnly(state.indicatorOnly),lanes=active.map(ticket=>{
    const lane=runtime[ticket.slot]||runtime[String(ticket.slot)]||{};
    return{
      mode:"INDICATOR_ONLY",
      slot:ticket.slot,
      pair:ticket.pair,
      timeframe:ticket.timeframe,
      indicator:ticket.indicator,
      length:ticket.length,
      filter:ticket.filter,
      units:ticket.units,
      lastCandle:lane.lastCandle||null,
      lastSignal:lane.lastSignal||null,
      lastSignalAt:lane.lastSignalAt||null,
      lastEventId:lane.lastEventId||null,
      lastExecutionEventId:lane.lastExecutionEventId||null,
      lastExecutionAt:lane.lastExecutionAt||null,
      lastError:lane.lastError||null,
    };
  });
  if(!lanes.length)lanes.push({mode:"NORMAL",slot:null,pair:"EUR_USD",timeframe:parent.timeframe||null,indicator:parent.strategy||null,length:parent.htlLength??null,filter:parent.filter??null,units:null,lastCandle:parent.lastCandle||null,lastSignal:null,lastSignalAt:null,lastEventId:null,lastExecutionEventId:null,lastExecutionAt:null,lastError:parent.lastError||null});
  const activeExecutionLastCandle=latestCandle(lanes),primary=active[0]||tickets[0],executionMode=active.length===0?"NORMAL":active.length===1?`INDICATOR_ONLY_TICKET_${active[0].slot}`:"INDICATOR_ONLY_DUAL";
  return{
    executionObservabilityVersion:EXECUTION_OBSERVABILITY_VERSION,
    executionMode,
    activeExecutionLaneCount:lanes.length,
    executionLanes:lanes,
    normalEngineLastCandle:parent.lastCandle||null,
    activeExecutionLastCandle,
    lastCandle:activeExecutionLastCandle||parent.lastCandle||null,
    indicatorOnly:{...primary,enabled:active.length>0,ticketCount:active.length},
    indicatorOnlyTickets:tickets,
    indicatorOnlyTicketRuntime:runtime,
    indicatorOnlyLegacyEnabled:Boolean(legacy.enabled),
    indicatorOnlyDualVersion:__indicatorOnlyDualTest.IO_DUAL_VERSION,
  };
}

export const __executionObservabilityTest=Object.freeze({EXECUTION_OBSERVABILITY_VERSION,latestCandle,executionSnapshot});
