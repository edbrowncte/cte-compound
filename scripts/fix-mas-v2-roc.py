from pathlib import Path

path=Path("public/mas-im-calculator.js")
text=path.read_text()
old='''  function roc(values,window=DEFAULT_ROC_WINDOW){
    const sample=values.filter(Number.isFinite).slice(-Math.max(2,window));
    if(sample.length<2)return NaN;
    return calculateSlopeStats(sample, sample.map((_,index)=>index)).slope;
  }
'''
new='''  function roc(values,window=DEFAULT_ROC_WINDOW){
    const sample=values.filter(Number.isFinite).slice(-Math.max(2,window));
    if(sample.length<2)return NaN;
    const n=sample.length,xMean=(n-1)/2,yMean=mean(sample);
    let numerator=0,denominator=0;
    for(let index=0;index<n;index++){numerator+=(index-xMean)*(sample[index]-yMean);denominator+=(index-xMean)**2;}
    return denominator>0?numerator/denominator:0;
  }
'''
if old not in text:
    raise SystemExit("MAS v2 ROC function marker not found")
text=text.replace(old,new,1)
old_export='__test:Object.freeze({trendPower,pressureFromForces,learnTransitionThreshold,transitionProbability,signWithDeadzone})'
new_export='__test:Object.freeze({trendPower,pressureFromForces,learnTransitionThreshold,transitionProbability,signWithDeadzone,roc})'
if old_export not in text:
    raise SystemExit("MAS v2 test export marker not found")
text=text.replace(old_export,new_export,1)
path.write_text(text)
print("Corrected MAS/IM ROC to support the intended five-observation acceleration window")
