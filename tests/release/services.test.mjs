import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {test} from "node:test";
import {openStore} from "../../server/storage.mjs";

const require=createRequire(import.meta.url);
const {create}=require("../../demo/v1/ad-bridge.js");

test("default ad bridge has no provider or visible rewards",async()=>{
  const bridge=create();
  assert.equal(bridge.status,"disabled");
  assert.equal(bridge.isReady("banner"),false);
  assert.equal((await bridge.showBanner()).status,"disabled");
  assert.equal((await bridge.showInterstitial()).status,"disabled");
  assert.equal((await bridge.showRewarded({onReward:()=>assert.fail()})).status,"disabled");
});

test("adapter errors, reward completion, timeouts, and frequency controls",async()=>{
  let attempts=0,rewards=0,now=0;
  const bridge=create({now:()=>now,timeoutMs:15,minIntervalMs:100,adapter:{
    isReady:()=>true,
    show:format=>{
      attempts++;
      if(format==="banner")return new Promise(()=>{});
      return {status:format==="rewarded"?"rewarded":"shown"};
    }
  }});
  const errors=[];
  const unsubscribe=bridge.onError(result=>errors.push(result.status));
  assert.equal(bridge.isReady("rewarded"),true);
  assert.equal((await bridge.showRewarded({onReward:()=>rewards++})).status,"rewarded");
  assert.equal(rewards,1);
  assert.equal((await bridge.showInterstitial()).status,"shown");
  assert.equal((await bridge.showInterstitial()).status,"frequency_limited");
  now+=100;
  assert.equal((await bridge.showInterstitial()).status,"shown");
  const banner=bridge.showBanner();
  assert.equal((await bridge.showBanner()).status,"busy");
  assert.equal((await banner).status,"timeout");
  assert.deepEqual(errors,["timeout"]);
  assert.equal(attempts,4);
  unsubscribe();
});

test("ingestion deduplicates retries and derives metrics from run cohorts",()=>{
  const storage=openStore(":memory:");
  const visitor=randomUUID(),visit=randomUUID(),run=randomUUID(),now=Date.now();
  const event=(name,data={})=>({id:randomUUID(),visitor,visit,run,name,lang:"en",wave:1,seconds:0,...data});
  const batch=[
    event("game_visit",{run:null}),
    event("game_start"),
    event("faction_selected",{faction:"arc",seconds:5}),
    event("upgrade_selected",{upgrade:"arc",seconds:5}),
    event("wave_clear",{wave:20,seconds:211}),
    event("game_complete",{wave:20,seconds:211})
  ];
  try {
    assert.equal(storage.add(batch,"CN",now),true);
    assert.equal(storage.add(batch,"CN",now+1000),true);
    assert.equal(storage.add([event("unsupported")],"unknown",now),false);
    assert.equal(storage.add([event("game_start",{wave:21})],"unknown",now),false);
    assert.equal(storage.add([event("game_start",{id:[randomUUID()]})],"unknown",now),false);
    const dashboard=storage.dashboard(7,now+1200);
    assert.deepEqual({...dashboard.overview},{starts:1,failed:0,completed:1,avg_seconds:211});
    assert.deepEqual({...dashboard.visits},{visits:1,browsers:1,start_visits:1,start_browsers:1});
    assert.equal(dashboard.factions[0].faction,"arc");
    assert.equal(dashboard.upgrades[0].selected,1);
    assert.equal(dashboard.markets[0].market,"CN");
    assert.deepEqual(storage.dashboard(90,now+91*86400000).events,[]);
  } finally {storage.close();}
});
