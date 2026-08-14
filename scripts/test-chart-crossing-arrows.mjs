import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../public/chart-crossing-arrows.js",import.meta.url),"utf8");
const labels=[];let priorCalls=0,liveSignals=[];
const ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},fillText(text){labels.push(text);},set font(value){this._font=value;},set textAlign(value){this._textAlign=value;},set textBaseline(value){this._textBaseline=value;},set fillStyle(value){this._fillStyle=value;}};
const canvas={getContext:()=>ctx};
const geometry={visibleStart:0,visibleEnd:3,indexToX:index=>10+index*10,priceToY:price=>100-price*10,pricePlot:{y:0,h:200}};
const sandbox={console,Math,Number,Array,Object,String,Boolean,Date,Set,Map,state:{},CTERuntimeIntegrity:{TF_MS:{M1:60000},chartContext:()=>({pair:"AUD_CAD",timeframe:"M1"}),liveExecutableSignals:()=>liveSignals},CTEUnifiedChart:{VERSION:"base",render:()=>{priorCalls++;return geometry;}}};sandbox.globalThis=sandbox;vm.runInNewContext(source,sandbox,{filename:"chart-crossing-arrows.js"});
const api=sandbox.CTEChartCrossingArrows;assert.ok(api);assert.equal(api.VERSION,"CTE_CHART_CROSSING_ARROWS@1.0.0");assert.equal(api.CROSSING_PRICE_BASIS,"INDICATOR_CROSSING_CURRENT_INSTRUMENT_PRICE");assert.equal(api.install(),true);assert.equal(sandbox.CTEUnifiedChart.__cteCrossingArrows,true);

const candles=[{time:"2026-08-14T19:36:00.000Z"},{time:"2026-08-14T19:37:00.000Z"},{time:"2026-08-14T19:38:00.000Z"}],signals=[{index:1,direction:1,time:"2026-08-14T19:37:00.000Z",price:.98284,current:false},{index:2,direction:-1,time:"2026-08-14T19:38:00.000Z",price:.98275,current:false},{index:2,direction:-1,time:"2026-08-14T19:38:00.000Z",price:.98275,current:true}];
sandbox.CTEUnifiedChart.render({canvas,candles,signals,formatPrice:value=>Number(value).toFixed(5)});assert.equal(priorCalls,1);assert.deepEqual(labels,["BUY @ 0.98284","SELL @ 0.98275"],"Every actual crossing must receive a directional arrow at that crossing's instrument price; the synthetic current-state row is not a crossing.");assert.equal(sandbox.state.chartCrossingArrowCount,2);

labels.length=0;liveSignals=[{direction:"BUY",sourceSignalTime:"2026-08-14T19:37:00.000Z",signalPrice:.98287,price:.98287}];sandbox.CTEUnifiedChart.render({canvas,candles,signals,formatPrice:value=>Number(value).toFixed(5)});assert.deepEqual(labels,["SELL @ 0.98275"],"A captured executable ASK/BID marker for the same crossing must take precedence over the analytical current-price overlay rather than creating a duplicate arrow.");

assert.equal(api.crossingSignals([{direction:1,price:1,current:false},{direction:-1,price:2,current:true}]).length,1);assert.equal(api.sameCrossing({direction:1,time:"2026-08-14T19:37:00.000Z"},{direction:"BUY",sourceSignalTime:"2026-08-14T19:37:35.000Z"},"M1"),true);assert.equal(api.sameCrossing({direction:1,time:"2026-08-14T19:37:00.000Z"},{direction:"BUY",sourceSignalTime:"2026-08-14T19:38:00.000Z"},"M1"),false);
assert.doesNotMatch(source,/\/api\/oanda\/order|executeImmediate|executeIndicatorOnlyUnits|closePosition/,"The chart arrow observer must never participate in order execution.");assert.doesNotMatch(source,/CROSS BUY|CROSS SELL/);assert.match(source,/BUY/);assert.match(source,/SELL/);
console.log("Chart crossing arrows certified: each true indicator crossing plots a BUY/SELL arrow at its instrument price, executable ASK/BID provenance overrides the same crossing, and the chart remains outside the order path.");
