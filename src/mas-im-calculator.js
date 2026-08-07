import "../public/mas-im-calculator.js";

const api=globalThis.CTEMASIM;
if(!api)throw new Error("CTE MAS/IM calculator failed to initialize");

export const MAS_IM_TIMEFRAMES=api.MAS_IM_TIMEFRAMES;
export const calculateSlopeStats=api.calculateSlopeStats;
export const calculateLogSlopeStats=api.calculateLogSlopeStats;
export const calculateMAS_IM_ZScores=api.calculateMAS_IM_ZScores;
export const calculateEventAngle=api.calculateEventAngle;
export const classifyType=api.classifyType;
