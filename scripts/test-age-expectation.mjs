import assert from "node:assert/strict";
import {AGE_EXPECTATION_VERSION,AGE_REALLOCATION_MIN_INDEX,AGE_REALLOCATION_DELTA_INDEX,greatExpectation,continuationExpectation,annotateAgeCandidate,reallocationDecision} from "../src/age-expectation.js";

const strongConfig={primary:{trades:42,net:155,score:31,maxDrawdown:2.5,winRate:.79}};
const moderateConfig={primary:{trades:18,net:28,score:7,maxDrawdown:10,winRate:.58}};
const context={
  pairReports:[
    {pair:"EUR_JPY",direction:"BUY",strength:.96,r2:.92,transitionProbability:.82,pipsPerHour:31,regime:"TREND_ALIGNED"},
    {pair:"USD_JPY",direction:"BUY",strength:.34,r2:.31,transitionProbability:.38,pipsPerHour:2,regime:"CHALLENGE"},
    {pair:"GBP_USD",direction:"SELL",strength:.72,r2:.71,transitionProbability:.67,pipsPerHour:13,regime:"TRANSITION"}
  ],
  mtfForecasts:[
    {pair:"EUR_JPY",direction:"BUY",confidence:.95,matches:8,available:10},
    {pair:"USD_JPY",direction:"BUY",confidence:.54,matches:4,available:10},
    {pair:"GBP_USD",direction:"SELL",confidence:.75,matches:6,available:10}
  ]
};
const strong=annotateAgeCandidate({pair:"EUR_JPY",event:{direction:1,id:"e1"},confidence:.95,count:8,configuration:strongConfig},context,"NEW_ENTRY");
const moderate=annotateAgeCandidate({pair:"GBP_USD",event:{direction:-1,id:"e2"},confidence:.7,count:6,configuration:moderateConfig},context,"NEW_ENTRY");
const weakContinuation=continuationExpectation({pair:"USD_JPY",direction:1},{event:{direction:1},configuration:moderateConfig},context);
assert.equal(AGE_EXPECTATION_VERSION,"AGE_GREAT_EXPECTATION@2.0.0");
assert.equal(AGE_REALLOCATION_MIN_INDEX,62);assert.equal(AGE_REALLOCATION_DELTA_INDEX,12);
assert.ok(strong.AGE.greatExpectation.index>weakContinuation.index,"strong alternative must outrank weak occupied capital");
assert.ok(Number.isFinite(strong.AGE.greatExpectation.expectedPipsPerHour));
const positions=[{instrument:"USD_JPY",long:{units:"1000"},short:{units:"0"}}];
const requirements={USD_JPY:{event:{direction:1},configuration:moderateConfig}};
const plan=reallocationDecision({positions,requirements,selectedCandidate:strong,context,manualPositions:{}});
assert.equal(plan.action,"REALLOCATE");assert.equal(plan.qualified,true);assert.equal(plan.displacement.pair,"USD_JPY");assert.ok(plan.delta>=AGE_REALLOCATION_DELTA_INDEX);assert.ok(plan.selected.index>=AGE_REALLOCATION_MIN_INDEX);
const similarPlan=reallocationDecision({positions,requirements,selectedCandidate:moderate,context,manualPositions:{}});
assert.notEqual(similarPlan.action,"REALLOCATE","insufficient expectation advantage must not churn occupied capital");
const protectedPlan=reallocationDecision({positions,requirements,selectedCandidate:strong,context,manualPositions:{USD_JPY:{protectedUntil:Date.now()+10000}}});
assert.notEqual(protectedPlan.action,"REALLOCATE","manually protected positions are outside AGE strategic displacement");
const reversal=annotateAgeCandidate({pair:"USD_JPY",event:{direction:-1,id:"r1"},confidence:.8,count:6,configuration:moderateConfig},context,"REVERSAL");
const reversalPlan=reallocationDecision({positions,requirements,selectedCandidate:reversal,context,manualPositions:{}});assert.equal(reversalPlan.action,"REVERSE");
const opposed=continuationExpectation({pair:"USD_JPY",direction:1},{event:{direction:-1},configuration:moderateConfig},context);assert.ok(opposed.index<=20);assert.equal(opposed.disposition,"OPPOSED_BY_CURRENT_III");
const opposedRequirements={USD_JPY:{event:{direction:-1},configuration:moderateConfig}};
const noRedundantDisplacement=reallocationDecision({positions,requirements:opposedRequirements,selectedCandidate:strong,context,manualPositions:{}});assert.notEqual(noRedundantDisplacement.action,"REALLOCATE","III-opposed positions are already exit obligations, not AGE strategic displacement targets");
const raw=greatExpectation(strong,context);assert.ok(raw.index>=0&&raw.index<=100);
console.log("AGE Great Expectation index, expected-pips/hour rate, continuation, reversal, protected-capital and certified reallocation gates verified.");
