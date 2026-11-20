const {readFileSync}=require("node:fs");
const vm=require("node:vm");
const {test}=require("node:test");
const assert=require("node:assert/strict");

test("retired cues have no playable binding, even with saved selections",()=>{
  const retired=["arc","combo","gun_fire","boss_defeated"];
  const world={window:{},document:{addEventListener(){}},localStorage:{
    getItem(){return JSON.stringify({selected:{arc:"arc-b02-metal-snap"},muted:{arc:false,gun_fire:false,combo:false,boss_defeated:false}});}
  }};
  vm.runInNewContext(readFileSync("demo/v1/sound-pack.js","utf8"),world);
  const audio=world.window.PinballGameAudio;
  for(const id of retired){
    assert.equal(audio.EVENT_IDS.includes(id),false,id+" must not bind a sample");
    assert.equal(audio.play(id),true,id+" must not fall through to a substitute sound");
    assert.equal(audio.hasBuffer(id),false);
  }
  assert.equal(audio.EVENTS.brick_hit.defaultVariant,"v5-wood-thud");
  assert.ok(audio.EVENTS.brick_break&&audio.EVENTS.wall_bounce&&audio.BGM.loop);
});
