import assert from "node:assert/strict";
import fs from "node:fs";
import {__executionTest} from "../src/engine-certified-execution.js";
import {__nemotronTest} from "../src/engine-nemotron-base.js";

const certified=fs.readFileSync("src/engine-certified-execution.js","utf8");
const nemotron=fs.readFileSync("src/engine-nemotron-base.js","utf8");
const html=fs.readFileSync("public/index.html","utf8");

assert.equal(__executionTest.AGE_POLICY_VERSION,"AGE_ADMINISTRATING_GREAT_EXPECTATIONS@1.0.0");
assert.equal(__executionTest.AGE_TIME_ZONE,"America/Chicago");

// Aug 14, 2026 is Friday and Nashville is on CDT (UTC-5).
const before=__executionTest.ageMarketWindow(new Date("2026-08-14T20:56:00.000Z"));
const flatten=__executionTest.ageMarketWindow(new Date("2026-08-14T20:57:00.000Z"));
const lateFriday=__executionTest.ageMarketWindow(new Date("2026-08-14T21:00:00.000Z"));
const saturday=__executionTest.ageMarketWindow(new Date("2026-08-15T17:00:00.000Z"));
const sundayBefore=__executionTest.ageMarketWindow(new Date("2026-08-16T21:04:00.000Z"));
const sundayOpen=__executionTest.ageMarketWindow(new Date("2026-08-16T21:05:00.000Z"));
assert.equal(before.weekendLock,false);
assert.equal(flatten.weekendLock,true);
assert.equal(flatten.flattenWindow,true);
assert.equal(lateFriday.weekendLock,true);
assert.equal(lateFriday.flattenWindow,false);
assert.equal(saturday.weekendLock,true);
assert.equal(sundayBefore.weekendLock,true);
assert.equal(sundayOpen.weekendLock,false);

assert.match(certified,/AGE Friday weekend flatten · 3:57 PM Nashville/);
assert.match(certified,/DEPLOYED_IN_QUALIFIED_POSITIVE_EXPECTATION_OR_WEEKEND_FLAT/);
assert.match(certified,/AGE_MARKET_REENGAGEMENT/);
assert.match(certified,/ageWeekendClose:"Friday 15:57 America\/Chicago"/);
assert.match(nemotron,/CAPITALIZATION_NEW_ENTRY_DISCRETION/);
assert.match(nemotron,/AGE_SELECT_BEST_QUALIFIED_EXPECTATION/);
assert.match(nemotron,/Capital is not strategically held idle while FX markets are open/);
assert.match(nemotron,/Friday weekend policy is flat from 3:57 PM America\/Chicago/);
assert.match(html,/Nemotron AGE · Administrating Great Expectations/);
assert.match(html,/AGE · Capitalization and Account Value Proliferation/);

assert.equal(__nemotronTest.AI_POLICY,"CAPITALIZATION_NEW_ENTRY_DISCRETION");
assert.equal(__nemotronTest.AI_TASK_NAME,"AGE");
assert.equal(__nemotronTest.AI_TASK,"ADMINISTRATING_GREAT_EXPECTATIONS");
console.log("AGE open-market engagement mandate, selective new-entry boundary, and Nashville Friday 15:57 weekend-flat window verified.");
