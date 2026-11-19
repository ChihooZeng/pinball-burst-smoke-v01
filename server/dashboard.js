"use strict";
const byId=id=>document.getElementById(id);
const percent=(a,b)=>b?(a*100/b).toFixed(1)+"%":"—";
const element=(name,text)=>{
  const node=document.createElement(name);node.textContent=String(text);return node;
};
function appendTable(parent,title,headers,rows){
  parent.append(element("h2",title));
  if(!rows.length){parent.append(element("p","No events in this period."));return;}
  const table=document.createElement("table");
  const head=table.createTHead().insertRow();
  for(const header of headers)head.append(element("th",header));
  const body=table.createTBody();
  for(const row of rows){
    const line=body.insertRow();
    for(const cell of row)line.append(element("td",cell??"—"));
  }
  parent.append(table);
}
function render(data){
  const container=byId("results");
  const {visits,overview}=data;
  appendTable(container,"Visits and runs",["Browsers","Started (browsers)","Visits","Visit → start","Runs","Mean play time (s)","Failures","Completions","Clear rate"],
    [[visits.browsers,visits.start_browsers,visits.visits,percent(visits.start_visits,visits.visits),overview.starts,overview.avg_seconds,overview.failed,overview.completed,percent(overview.completed,overview.starts)]]);
  appendTable(container,"Builds",["First faction","Starts","Completions","Clear rate","Mean play time (s)"],
    data.factions.map(row=>[row.faction,row.starts,row.completed,percent(row.completed,row.starts),row.avg_seconds]));
  appendTable(container,"Upgrades",["Upgrade","Times selected"],data.upgrades.map(row=>[row.upgrade,row.selected]));
  appendTable(container,"Failures",["Cause","Runs"],data.failures.map(row=>[row.reason,row.count]));
  appendTable(container,"Unfinished runs",["Last observed wave","Runs"],data.exits.map(row=>[row.wave,row.exits]));
  appendTable(container,"Game language",["Language","Visits","Share"],data.languages.map(row=>[row.lang,row.visits,percent(row.visits,visits.visits)]));
  appendTable(container,"Markets",["Market","Starts","Completions","Clear rate","Mean play time (s)"],
    data.markets.map(row=>[row.market,row.starts,row.completed,percent(row.completed,row.starts),row.avg_seconds]));
  appendTable(container,"Event counts",["Event","Count"],data.events.map(row=>[row.name,row.count]));
}
byId("access").addEventListener("submit",async event=>{
  event.preventDefault();
  byId("results").replaceChildren();
  byId("status").textContent="Loading…";
  try{
    const response=await fetch("/api/dashboard?days="+byId("period").value,
      {headers:{Authorization:"Bearer "+byId("token").value},cache:"no-store"});
    if(response.status===401){byId("status").textContent="Token rejected.";return;}
    if(!response.ok)throw new Error();
    render(await response.json());
    byId("status").textContent="Updated. Counts cover visitors who enabled analytics.";
  }catch{byId("status").textContent="Could not load metrics.";}
});
