const assert = require("node:assert/strict");
const test = require("node:test");
const builds = require("../../demo/v1/builds.js");
const locale = require("../../demo/v1/i18n.js");

for (const language of ["zh-CN","en"]) {
  test(`all three builds keep three readable upgrade choices in ${language}`,()=>{
    locale.set(language);
    for (const faction of ["split","arc","gun"]) {
      for(let seed=0;seed<50;seed++){
        const state=builds.createState(seed);
        assert.ok(builds.choose(state,faction,1));
        for(let wave=2;wave<=19;wave++){
          const ids=builds.offer(state,wave);
          assert.equal(new Set(ids).size,3);
          for(const id of ids){
            const {title,description}=builds.card(state,id);
            assert.ok(title&&description);
            assert.doesNotMatch(title+" "+description,/\{\w+\}|undefined|NaN/);
            if(language==="en")assert.doesNotMatch(title+" "+description,/\p{Script=Han}/u);
          }
          assert.ok(builds.choose(state,ids[seed%3],wave));
        }
      }
    }
  });
}
