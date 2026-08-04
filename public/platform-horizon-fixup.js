(function finalizeHorizonBrowserContract(root){
  "use strict";
  const VERSION=root.CTE_HORIZON_HTL?.VERSION;
  if(!VERSION||typeof root.oandaPost!=="function")return;
  const prior=root.oandaPost;
  root.oandaPost=async function canonicalCandidatePost(path,body){
    if(body?.cteContext?.crossingIdentity){
      body={...body,cteContext:{...body.cteContext,crossingStrategy:"ASSET",strategy:body.cteContext.strategy||"ASSET"}};
    }
    return prior(path,body);
  };
  try{oandaPost=root.oandaPost;}catch{}
})(globalThis);
