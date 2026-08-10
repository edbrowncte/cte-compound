import { HtlEngine as UnitsEngine } from "./engine-indicator-only-units.js";
import { candles, candlesForRange, LENGTH_GRID, VALIDATION } from "./horizon-platform-engine.js";
import { STRATEGY_ENGINE_VERSION } from "./horizon-strategy-v1.js";
import { RUNTIME_OPTIMIZER_HISTORY_BARS, runtimeOptimizerStorageKey } from "./optimized-optimizer.js";
import { IOI_IOM_PERFORMANCE_VERSION, optimizeIoiIomPerformance } from "./ioi-iom-performance.js";

export class HtlEngine extends UnitsEngine{
  async computeConfiguration(value={}){
    const result=await super.computeConfiguration(value),pair=String(value.pair||"").toUpperCase(),timeframe=String(value.timeframe||"").toUpperCase(),startDate=String(value.startDate||""),endDate=String(value.endDate||""),hasDateRange=Boolean(startDate||endDate),token=String(this.env.OANDA_API_KEY||"").trim();
    try{
      const data=hasDateRange?await candlesForRange(pair,token,timeframe,startDate,endDate):await candles(pair,token,timeframe,RUNTIME_OPTIMIZER_HISTORY_BARS),analytical=optimizeIoiIomPerformance(data,pair,timeframe,LENGTH_GRID,VALIDATION,STRATEGY_ENGINE_VERSION),priorRows=Array.isArray(result.record?.grossPerformance)?result.record.grossPerformance:[];
      result.record.config={...(result.record.config||{}),...analytical.config};
      result.record.grossPerformance=[...priorRows.filter(row=>!["IOI · Indicator Only Indicator","IOM · Indicator Only Mean"].includes(row?.Strategy)),...analytical.rows];
      result.record.ioiIomPerformanceVersion=IOI_IOM_PERFORMANCE_VERSION;
      await this.ctx.storage.put(runtimeOptimizerStorageKey(result.key),result.record);
      return result;
    }catch(error){
      if(!error.stage)error.stage="ioi-iom-performance";
      throw error;
    }
  }
}
