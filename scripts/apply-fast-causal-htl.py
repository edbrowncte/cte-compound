from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)


html_path = Path("public/index.html")
html = html_path.read_text()
old = '''  function htlCausal(data,length){
    const asset=Array(data.length).fill(null),inverse=Array(data.length).fill(null),sourceTotal=Array(data.length).fill(0),first=Math.max(1,length*3-1);
    for(let index=first;index<data.length;index++){const snapshot=htlBuild(data.slice(0,index+1),length);asset[index]=snapshot.asset.at(-1);inverse[index]=snapshot.inverse.at(-1);sourceTotal[index]=snapshot.sourceCrosses.length;}
    return {asset,inverse,sourceTotal,causal:true};
  }
'''
new = '''  function htlCausal(data,length){
    const series=htlCore(data,length),families=[[series.hl2,series.upr],[series.mui,series.ui],[series.zui,series.iuz]],crosses=new Map();
    for(let index=1;index<data.length;index++){const directions=families.map(pair=>htlCross(pair[0],pair[1],index)).filter(Boolean),vote=directions.reduce((sum,value)=>sum+value,0);if(vote)crosses.set(index,{index,direction:Math.sign(vote)});}
    const asset=Array(data.length).fill(null),inverse=Array(data.length).fill(null),assetMean=Array(data.length).fill(null),sourceTotal=Array(data.length).fill(0),finalized=[];let active=null,total=0;
    const begin=event=>({index:event.index,direction:event.direction,price:event.direction>0?data[event.index].high:data[event.index].low,extremeIndex:event.index});
    const update=(episode,index)=>{const price=episode.direction>0?data[index].high:data[index].low;if((episode.direction>0&&price>episode.price)||(episode.direction<0&&price<episode.price)){episode.price=price;episode.extremeIndex=index;}};
    const dedup=anchors=>{const out=[];for(const anchor of anchors.sort((a,b)=>a.index-b.index)){if(out.length&&out.at(-1).index===anchor.index)out[out.length-1]=anchor;else out.push(anchor);}return out;};
    const assetAt=(anchors,index)=>{if(!anchors.length)return null;if(index<=anchors[0].index)return anchors[0].price;for(let position=1;position<anchors.length;position++){const from=anchors[position-1],to=anchors[position];if(index<=to.index){const span=Math.max(1,to.index-from.index);return from.price+(to.price-from.price)*((index-from.index)/span);}}return anchors.at(-1).price;};
    const first=Math.max(1,length*3-1),denominator=length*(length+1)/2;
    for(let index=0;index<data.length;index++){
      const event=crosses.get(index);if(event){total++;if(!active)active=begin(event);else if(event.direction!==active.direction){finalized.push({index:active.extremeIndex,price:active.price,direction:active.direction,status:"FINAL"});active=begin(event);}}
      if(active)update(active,index);sourceTotal[index]=total;if(index<first||!active)continue;
      const anchors=dedup([...finalized,{index:active.extremeIndex,price:active.price,direction:active.direction,status:"PROVISIONAL"}]),start=Math.max(0,index-length+1),window=[];for(let cursor=start;cursor<=index;cursor++)window.push(assetAt(anchors,cursor));
      if(window.length!==length||!window.every(Number.isFinite))continue;const current=window.at(-1),mean=window.reduce((sum,value,position)=>sum+(position+1)*value,0)/denominator,average=window.reduce((sum,value)=>sum+value,0)/length,deviation=Math.sqrt(window.reduce((sum,value)=>sum+(value-average)**2,0)/length);asset[index]=current;assetMean[index]=mean;inverse[index]=deviation>0?(2*mean)-current:null;
    }
    return {asset,inverse,assetMean,sourceTotal,series,causal:true};
  }
'''
html = replace_once(html, old, new, "incremental causal HTL")
html_path.write_text(html)

test_path = Path("scripts/test-runtime.mjs")
test = test_path.read_text()
test = replace_once(
    test,
    'assert.match(html,/MAX_CANDLE_REQUESTS=3/);',
    'assert.match(html,/MAX_CANDLE_REQUESTS=3/);assert.match(html,/const assetAt=/);assert.doesNotMatch(html,/htlBuild\\(data\\.slice\\(0,index\\+1\\),length\\)/);',
    "incremental HTL assertions",
)
test_path.write_text(test)

check_path = Path("scripts/check-html.mjs")
check = check_path.read_text()
check = replace_once(
    check,
    '"MAX_CANDLE_REQUESTS=3","eventLoadedKey"',
    '"MAX_CANDLE_REQUESTS=3","eventLoadedKey","const assetAt="',
    "incremental HTL check",
)
check_path.write_text(check)

Path("scripts/fast-htl-trigger").unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
