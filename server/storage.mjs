import {DatabaseSync} from "node:sqlite";

const names=new Set([
  "game_visit","game_start","tutorial_complete","wave_start","wave_clear","upgrade_selected",
  "faction_selected","boss_start","boss_defeated","game_over","game_complete","game_restart",
  "pause","resume","session_exit","run_heartbeat"
]);
const factions=new Set(["split","arc","gun"]);
const upgrades=new Set([
  ...factions,"split-a","split-b","arc-a","arc-b","gun-a","gun-b","rate","power","speed","life","hunter","drill","shock","bank"
]);
const reasons=new Set(["regular","boss","boss_support","final_support","restart","exit","settings","background","keyboard"]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const day=86400000;

const isUuid=value=>typeof value==="string"&&uuid.test(value);

function clean(entry){
  if(!entry||!isUuid(entry.id)||!isUuid(entry.visitor)||!isUuid(entry.visit)||!names.has(entry.name)||
    !["zh-CN","en"].includes(entry.lang))return null;
  const visit=entry.name==="game_visit";
  if(visit?entry.run!==null:!isUuid(entry.run))return null;
  const wave=visit?null:entry.wave;
  const seconds=visit?null:entry.seconds;
  if(!visit&&(!Number.isInteger(wave)||wave<1||wave>20||
    !Number.isInteger(seconds)||seconds<0||seconds>21600))return null;
  const faction=factions.has(entry.faction)?entry.faction:null;
  const upgrade=upgrades.has(entry.upgrade)?entry.upgrade:null;
  const reason=reasons.has(entry.reason)?entry.reason:null;
  if(entry.name==="faction_selected"&&!faction||entry.name==="upgrade_selected"&&!upgrade)return null;
  return [entry.id,entry.visitor,entry.visit,entry.run,entry.name,entry.lang,wave,seconds,faction,upgrade,reason];
}

export function openStore(file){
  const db=new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, visitor TEXT NOT NULL, visit TEXT NOT NULL, run TEXT, name TEXT NOT NULL, lang TEXT NOT NULL,
      wave INTEGER, seconds INTEGER, faction TEXT, upgrade TEXT, reason TEXT, market TEXT NOT NULL,
      received INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_since ON events(received);
    CREATE INDEX IF NOT EXISTS events_run ON events(run);
  `);
  const insert=db.prepare("INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const expire=db.prepare("DELETE FROM events WHERE received < ?");
  const count=db.prepare("SELECT COUNT(*) AS total FROM events");
  let nextCleanup=0,total=count.get().total;
  function cleanup(now=Date.now()){
    if(now>=nextCleanup){
      total-=Number(expire.run(now-90*day).changes);
      nextCleanup=now+60*60*1000;
    }
  }
  function add(batch,market,now=Date.now()){
    if(!Array.isArray(batch)||!batch.length||batch.length>24)return false;
    const cleaned=batch.map(clean);
    if(cleaned.some(entry=>entry===null))return false;
    cleanup(now);
    if(total>=2000000)return "capacity";
    db.exec("BEGIN");
    try {
      let added=0;
      for(const entry of cleaned)added+=Number(insert.run(...entry,market,now).changes);
      db.exec("COMMIT");
      total+=added;
    } catch(error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return true;
  }
  function dashboard(days=30, now=Date.now()){
    cleanup(now);
    const since=now-days*day;
    const query=(sql,...params)=>db.prepare(sql).all(...params);
    const runs=`
      WITH recent AS (SELECT * FROM events WHERE received>=? AND run IS NOT NULL),
      runs AS (
        SELECT run, MAX(seconds) seconds, MAX(wave) wave,
          MAX(name='game_start') started, MAX(name='game_complete') completed,
          MAX(name='game_over') failed, MAX(name='game_restart') restarted,
          MAX(received) last_seen,
          MAX(CASE WHEN name='faction_selected' THEN faction END) faction,
          MAX(CASE WHEN name='game_start' THEN lang END) lang,
          MAX(CASE WHEN name='game_start' THEN market END) market
        FROM recent GROUP BY run
      )
    `;
    return {
      days,
      visits:query(`SELECT COUNT(DISTINCT visit) visits, COUNT(DISTINCT visitor) browsers,
        COUNT(DISTINCT CASE WHEN name='game_start' THEN visit END) start_visits,
        COUNT(DISTINCT CASE WHEN name='game_start' THEN visitor END) start_browsers
        FROM events WHERE received>=? AND name IN ('game_visit','game_start')`,since)[0],
      overview:query(runs+`SELECT COUNT(*) starts, COALESCE(SUM(completed),0) completed,
        COALESCE(SUM(failed),0) failed, COALESCE(ROUND(AVG(seconds),1),0) avg_seconds
        FROM runs WHERE started=1`,since)[0],
      events:query("SELECT name, COUNT(*) count FROM events WHERE received>=? GROUP BY name ORDER BY name",since),
      factions:query(runs+`SELECT faction, COUNT(*) starts, SUM(completed) completed,
        ROUND(AVG(seconds),1) avg_seconds FROM runs WHERE started=1 AND faction IS NOT NULL GROUP BY faction`,since),
      upgrades:query(`SELECT upgrade, COUNT(*) selected FROM events
        WHERE received>=? AND name='upgrade_selected' GROUP BY upgrade ORDER BY selected DESC`,since),
      failures:query(`SELECT reason, COUNT(DISTINCT run) count FROM events
        WHERE received>=? AND name='game_over' GROUP BY reason ORDER BY count DESC`,since),
      exits:query(runs+`SELECT wave, COUNT(*) exits FROM runs WHERE started=1 AND completed=0
        AND failed=0 AND (restarted=1 OR last_seen<?) GROUP BY wave ORDER BY wave`,since,now-30*60*1000),
      languages:query(`SELECT lang, COUNT(DISTINCT visit) visits FROM events
        WHERE received>=? AND name='game_visit' GROUP BY lang`,since),
      markets:query(runs+`SELECT market, COUNT(*) starts, SUM(completed) completed, ROUND(AVG(seconds),1) avg_seconds
        FROM runs WHERE started=1 GROUP BY market`,since)
    };
  }
  cleanup();
  return {add,dashboard,cleanup,close:()=>db.close()};
}
