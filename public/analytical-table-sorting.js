(function installAnalyticalTableSorting(global){
  "use strict";

  const VERSION="CTE_ANALYTICAL_TABLE_SORTING@1.1.0";
  const RATE_COLUMNS=Object.freeze([
    ["Rank","number"],["Pair","text"],["Timeframe","text"],["Signal","text"],["Pips/Hr","number"],["|Pips/Hr|","number"],["Median |Event P/L|","number"],["FINAL events","number"],["P/L n","number"],["History","number"],["HTL length","number"],["Support","text"],["Regime","text"]
  ]);
  const EVENT_LEDGER_COLUMNS=Object.freeze([
    ["Event","event"],["Timeframe","text"],["Status","text"],["Result","text"],["Event P/L (pips)","number"],["Start","date"],["Bars","number"],["High","number"],["Low","number"],["Spread μ","number"],["Spread σ²","number"],["Slope","number"],["Area","number"],["Source crosses","number"]
  ]);
  const NON_FILTER_STRATEGIES=new Set(["HTL ASSET","ASSET","DARE","COMBO","COMBO / CSF","CSF"]);
  let rateSort=null,eventLedgerSort=null,rateQueued=false,ledgerQueued=false,optimizerQueued=false;

  function parseValue(value,type="text"){
    const text=String(value??"").trim();
    if(!text||text==="—"||text==="…")return null;
    if(type==="date"){
      const parsed=Date.parse(text);
      return Number.isFinite(parsed)?parsed:null;
    }
    if(type==="event"){
      const match=text.match(/(-?\d+(?:\.\d+)?)\s*$/);
      return match?Number(match[1]):text.toUpperCase();
    }
    if(type==="number"){
      const match=text.replaceAll(",","").match(/-?\d+(?:\.\d+)?/);
      return match?Number(match[0]):null;
    }
    return text.toUpperCase();
  }

  function compareValues(left,right,type="text",direction=1){
    const a=parseValue(left,type),b=parseValue(right,type);
    if(a===null&&b===null)return 0;
    if(a===null)return 1;
    if(b===null)return -1;
    const comparison=typeof a==="number"&&typeof b==="number"
      ? a-b
      : String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:"base"});
    return direction*comparison;
  }

  function sortBody(table,sort,columns){
    const body=table?.tBodies?.[0];
    if(!body||!sort)return false;
    const rows=[...body.rows].filter(row=>row.cells.length>1&&!row.querySelector("td[colspan]"));
    const ordered=[...rows].sort((left,right)=>compareValues(
      left.cells[sort.index]?.textContent,
      right.cells[sort.index]?.textContent,
      columns[sort.index]?.[1]||"text",
      sort.direction
    ));
    if(ordered.some((row,index)=>row!==rows[index])){
      const fragment=document.createDocumentFragment();
      ordered.forEach(row=>fragment.appendChild(row));
      body.appendChild(fragment);
    }
    return true;
  }

  function headerButton(th,label,attribute,index,sort){
    let button=th.querySelector(`button[${attribute}]`);
    if(!button){
      th.textContent="";
      button=document.createElement("button");
      button.type="button";
      button.setAttribute(attribute,String(index));
      button.style.cssText="border:0;background:transparent;color:inherit;padding:0;font:inherit;font-weight:inherit;letter-spacing:inherit;white-space:nowrap";
      th.appendChild(button);
    }
    const active=sort?.index===index,nextText=active?`${label} ${sort.direction>0?"▲":"▼"}`:label;
    if(button.textContent!==nextText)button.textContent=nextText;
    th.setAttribute("aria-sort",active?(sort.direction>0?"ascending":"descending"):"none");
    return button;
  }

  function configureRateTable(){
    if(typeof document==="undefined")return false;
    const table=document.querySelector("#rateFluctuationRanking table"),header=table?.tHead?.rows?.[0];
    if(!table||!header||header.cells.length!==RATE_COLUMNS.length)return false;
    RATE_COLUMNS.forEach(([label],index)=>headerButton(header.cells[index],label,"data-rate-table-sort",index,rateSort));
    if(table.dataset.cteRateSortBound!=="true"){
      table.dataset.cteRateSortBound="true";
      table.addEventListener("click",event=>{
        const button=event.target.closest("[data-rate-table-sort]");
        if(!button)return;
        const index=Number(button.getAttribute("data-rate-table-sort"));
        if(!Number.isInteger(index))return;
        rateSort=rateSort?.index===index?{index,direction:-rateSort.direction}:{index,direction:1};
        configureRateTable();
        sortBody(table,rateSort,RATE_COLUMNS);
      });
    }
    if(rateSort)sortBody(table,rateSort,RATE_COLUMNS);
    const body=table.tBodies?.[0];
    if(body&&body.dataset.cteRateSortObserved!=="true"&&typeof MutationObserver!=="undefined"){
      body.dataset.cteRateSortObserved="true";
      new MutationObserver(()=>{
        if(rateQueued)return;
        rateQueued=true;
        queueMicrotask(()=>{rateQueued=false;configureRateTable();});
      }).observe(body,{childList:true});
    }
    return true;
  }

  function ledgerTimeframe(){
    if(typeof state==="undefined")return "—";
    return String(state.eventLedgerTimeframe||document.getElementById("eventTimeframe")?.value||state.selectedTimeframe||"—");
  }

  function configureEventLedger(){
    if(typeof document==="undefined")return false;
    const body=document.getElementById("eventLedger"),table=body?.closest("table"),header=table?.tHead?.rows?.[0];
    if(!body||!table||!header)return false;
    if(header.cells.length===13){
      const th=document.createElement("th");
      th.dataset.eventLedgerTimeframe="true";
      header.cells[0]?.insertAdjacentElement("afterend",th);
    }
    if(header.cells.length!==EVENT_LEDGER_COLUMNS.length)return false;
    const timeframe=ledgerTimeframe();
    for(const row of body.rows){
      if(row.cells.length===1&&row.cells[0].hasAttribute("colspan")){
        row.cells[0].colSpan=14;
        continue;
      }
      if(row.cells.length===13){
        const cell=document.createElement("td");
        cell.dataset.eventLedgerTimeframe="true";
        row.cells[0]?.insertAdjacentElement("afterend",cell);
      }
      if(row.cells[1]){
        row.cells[1].dataset.eventLedgerTimeframe="true";
        if(row.cells[1].textContent!==timeframe)row.cells[1].textContent=timeframe;
      }
    }
    EVENT_LEDGER_COLUMNS.forEach(([label],index)=>headerButton(header.cells[index],label,"data-event-ledger-table-sort",index,eventLedgerSort));
    if(table.dataset.cteEventLedgerSortBound!=="true"){
      table.dataset.cteEventLedgerSortBound="true";
      table.addEventListener("click",event=>{
        const button=event.target.closest("[data-event-ledger-table-sort]");
        if(!button)return;
        const index=Number(button.getAttribute("data-event-ledger-table-sort"));
        if(!Number.isInteger(index))return;
        eventLedgerSort=eventLedgerSort?.index===index?{index,direction:-eventLedgerSort.direction}:{index,direction:1};
        configureEventLedger();
        sortBody(table,eventLedgerSort,EVENT_LEDGER_COLUMNS);
      });
    }
    if(eventLedgerSort)sortBody(table,eventLedgerSort,EVENT_LEDGER_COLUMNS);
    if(body.dataset.cteEventLedgerSortObserved!=="true"&&typeof MutationObserver!=="undefined"){
      body.dataset.cteEventLedgerSortObserved="true";
      new MutationObserver(()=>{
        if(ledgerQueued)return;
        ledgerQueued=true;
        queueMicrotask(()=>{ledgerQueued=false;configureEventLedger();});
      }).observe(body,{childList:true});
    }
    return true;
  }

  function configureOptimizerFilterSemantics(){
    if(typeof document==="undefined")return false;
    const body=document.getElementById("optimizerRegistryBody");if(!body)return false;
    for(const row of body.rows){if(row.cells.length<5||row.cells[0]?.hasAttribute("colspan"))continue;const strategy=String(row.cells[2]?.textContent||"").trim().toUpperCase(),cell=row.cells[4];if(NON_FILTER_STRATEGIES.has(strategy)){cell.textContent="—";cell.dataset.filterApplicable="false";cell.title="Not applicable: this registered strategy has no independent filter parameter; optimizer selection is length-driven or derived.";}else{cell.dataset.filterApplicable="true";}}
    if(body.dataset.cteOptimizerFilterObserved!=="true"&&typeof MutationObserver!=="undefined"){
      body.dataset.cteOptimizerFilterObserved="true";
      new MutationObserver(()=>{if(optimizerQueued)return;optimizerQueued=true;queueMicrotask(()=>{optimizerQueued=false;configureOptimizerFilterSemantics();});}).observe(body,{childList:true});
    }
    return true;
  }

  function install(){
    if(typeof document==="undefined")return false;
    configureRateTable();
    configureEventLedger();
    configureOptimizerFilterSemantics();
    return true;
  }

  global.CTEAnalyticalTableSorting=Object.freeze({VERSION,RATE_COLUMNS,EVENT_LEDGER_COLUMNS,NON_FILTER_STRATEGIES,parseValue,compareValues,configureRateTable,configureEventLedger,configureOptimizerFilterSemantics,install});
  if(typeof document!=="undefined"){
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
    else queueMicrotask(install);
  }
})(globalThis);
