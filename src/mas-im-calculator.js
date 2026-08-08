import "../public/mas-im-calculator.js";

const api=globalThis.CTEMASIM;
if(!api)throw new Error("CTE MAS/IM calculator failed to initialize");

export const MAS_IM_VERSION=api.VERSION;
export const MAS_IM_TIMEFRAMES=api.MAS_IM_TIMEFRAMES;
export const MAS_IM_TF_MS=api.TF_MS;
export const timeframeHierarchy=api.timeframeHierarchy;
export const calculateSlopeStats=api.calculateSlopeStats;
export const calculateLogSlopeStats=api.calculateLogSlopeStats;
export const calculateMASIMPressure=api.calculateMASIMPressure;
export const calculateMAS_IM_ZScores=api.calculateMAS_IM_ZScores;
export const calculateEventAngle=api.calculateEventAngle;
export const classifyType=api.classifyType;
export const __masImTest=api.__test;
