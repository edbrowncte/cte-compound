import assert from "node:assert/strict";
import fs from "node:fs";
import {__executionTest} from "../src/engine-certified-execution.js";
import {__nemotronTest} from "../src/engine-nemotron-base.js";

const certified=fs.readFileSync("src/engine-certified-execution.js","utf8");
const nemotron=fs.readFileSync("src/engine-nemotron-base.js","utf8");
const html=fs.readFileSync("public/index.html","utf8");

assert.equal(__executionTest.AGE_POLICY_VERSION,"AGE_ADMINISTRATING_GREAT_EXPECTATIONS@2.0.0");
assert.equal(__executionTest.AGE_EXPECTATION_VERSION,"AGE_GREAT_EXPECTATION@2.0.0");
assert.equal(__executionTest.AGE_TIME_ZONE,"America/Chicago");
assert.equal(__executionTest.AGE_REALLOCATION_MIN_INDEX,62);
assert.equal(__executionTest.AGE_REALLOCATION_DELTA_INDEX,12);

// Aug 14, 2026 is Friday and Nashville is on CDT (UTC-5).
const before=__executionTest.ageMarketWindow(new Date("2026-08-14T20:56:00.000Z"));
const flatten=__executionTest.ageMarketWindow(new Date("2026-08-14T20:57:00.000Z"));
const lateFriday=__executionTest.ageMarketWindow(new Date("2026-08-14T21:00:00.000Z"));
const saturday=__executionTest.ageMarketWindow(new Date("2026-08-15T17:00:00.000Z"));
const sundayBefore=__executionTest.ageMarketWindow(new Date("2026-08-16T21:04:00.000Z"));
const sundayOpen=__executionTest.ageMarketWindow(new Date("2026-08-16T21:05:00.000Z"));
assert.equal(before.weekendLock,false);assert.equal(flatten.weekendLock,true);assert.equal(flatten.flattenWindow,true);assert.equal(lateFriday.weekendLock,true);assert.equal(lateFriday.flattenWindow,false);assert.equal(saturday.weekendLock,true);assert.equal(sundayBefore.weekendLock,true);assert.equal(sundayOpen.weekendLock,false);

assert.match(certified,/AGE Friday weekend flatten · 3:57 PM Nashville/);
assert.match(certified,/DEPLOYED_IN_QUALIFIED_POSITIVE_EXPECTATION_OR_WEEKEND_FLAT/);
assert.match(certified,/AGE_MARKET_REENGAGEMENT/);
assert.match(certified,/ageWeekendClose:"Friday 15:57 America\/Chicago"/);
assert.match(certified,/AGE_EXPECTATION_MIGRATION/);
assert.match(certified,/AGE_EXPECTATION_DECISION/);
assert.match(certified,/AGE reallocation · GE delta/);
assert.equal((certified.match(/\n  async tick\(\)\{/g)||[]).length,1,"AGE weekend policy must live in the one effective certified tick; shadowed duplicate ticks are forbidden");
assert.match(nemotron,/AGE_CAPITAL_REALLOCATION_DISCRETION/);
assert.match(nemotron,/AGE_SELECT_BEST_QUALIFIED_DEPLOYMENT/);
assert.match(nemotron,/Qualified same-pair reversals do not inherit capital automatically/);
assert.match(nemotron,/Friday weekend policy is flat from 3:57 PM America\/Chicago/);
assert.match(html,/Nemotron AGE · Administrating Great Expectations/);
assert.match(html,/AGE · Capitalization and Account Value Proliferation/);
assert.match(html,/id="AgeAction"/);assert.match(html,/id="AgeExpectation"/);assert.match(html,/id="AgeGate"/);

assert.equal(__nemotronTest.AI_POLICY,"AGE_CAPITAL_REALLOCATION_DISCRETION");
assert.equal(__nemotronTest.AI_TASK_NAME,"AGE");
assert.equal(__nemotronTest.AI_TASK,"ADMINISTRATING_GREAT_EXPECTATIONS");
console.log("AGE v2 open-market engagement, Great Expectation reallocation, one effective tick, and Nashville Friday 15:57 weekend-flat window verified.");
