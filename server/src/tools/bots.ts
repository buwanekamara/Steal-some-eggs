/**
 * Test bots.
 *   npm run bots            → 3 bots jogging in front of their bases
 *   npm run bots -- 6       → 6 bots
 *   npm run bots -- 2 check → automated multiplayer / treadmill / save / heist / pen / upgrade & shop checks, then exit (PASS/FAIL)
 * Set BOT_BASE=<0-7> to make all bots jog in front of that base instead of their own.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Client, type Room } from "@colyseus/sdk";
import {
  Anim,
  BIOMES,
  CHEST,
  CLOSE,
  EGG_RULES,
  EggStatus,
  FEATURED,
  GUARDIANS,
  HUB_BUILDINGS,
  NESTS,
  PVP,
  SELL_MULT,
  TRAP,
  useSpot,
  GuardianMode,
  MSG,
  SAFE_ZONE_Z,
  ROOM_NAME,
  TREADMILL_SHAPE,
  basePlot,
  biomeStartZ,
  slotCost,
  walkSpeedFromStat,
  type CorrectMsg,
  type JoinOptions,
  type HatchedMsg,
  type InventoryMsg,
  type KnockMsg,
  type MoveMsg,
  type NotifyMsg,
  type SecuredMsg,
} from "@egg/shared";

const count = Math.max(2, Number(process.argv[2] ?? 3));
const check = process.argv.includes("check");
const url = process.env.SERVER ?? "http://localhost:2567";

interface PlayerLike {
  name: string;
  baseIndex: number;
  x: number;
  y: number;
  z: number;
  ry: number;
  speedStat: number;
  training: boolean;
  carrying: string;
  eggCount: number;
  money: number;
  income: number;
  penSlots: number;
  penLevel: number;
  trail: string;
  treadmillLevel: number;
  pets: Map<string, { species: string; income: number }>;
  penEggs: Map<string, { defId: string; readyIn: number; x: number; z: number }>;
  equipped: string;
  trapsAvailable: number;
  equippedEggUid: string;
}

interface TrapLike {
  x: number;
  z: number;
  ownerId: string;
  placedAt: number;
}

interface EggLike {
  defId: string;
  state: number;
  carrier: string;
  nest: number;
  x: number;
  z: number;
}

interface GuardianLike {
  x: number;
  z: number;
  mode: number;
  target: string;
}

interface Bot {
  room: Room;
  profileId: string;
  corrections: CorrectMsg[];
  knocks: KnockMsg[];
  secured: SecuredMsg[];
  notes: NotifyMsg[];
  inventory?: InventoryMsg;
  hatched: HatchedMsg[];
  fused: HatchedMsg[];
  leaveCode?: number;
  onCorrect?: (m: CorrectMsg) => void;
}

/** Joins the shared room, or a specific room (check mode uses a fresh one so real players don't skew counts). */
async function join(name: string, profileId: string, roomId?: string): Promise<Bot> {
  const client = new Client(url);
  const opts: JoinOptions = { name, profileId };
  const room = roomId === "new" ? await client.create(ROOM_NAME, opts) : roomId ? await client.joinById(roomId, opts) : await client.joinOrCreate(ROOM_NAME, opts);
  const bot: Bot = { room, profileId, corrections: [], knocks: [], secured: [], notes: [], hatched: [], fused: [] };
  room.onMessage(MSG.Inventory, (m: InventoryMsg) => (bot.inventory = m));
  room.onMessage(MSG.Hatched, (m: HatchedMsg) => bot.hatched.push(m));
  room.onMessage(MSG.Fused, (m: HatchedMsg) => bot.fused.push(m));
  room.send(MSG.Inventory);
  room.onMessage(MSG.Knock, (m: KnockMsg) => bot.knocks.push(m));
  room.onMessage(MSG.Secured, (m: SecuredMsg) => bot.secured.push(m));
  room.onMessage(MSG.Notify, (m: NotifyMsg) => bot.notes.push(m));
  room.onMessage(MSG.Correct, (m: CorrectMsg) => {
    bot.corrections.push(m);
    bot.onCorrect?.(m);
  });
  room.onLeave((code) => (bot.leaveCode = code));
  return bot;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function players(room: Room) {
  return (room.state as { players: Map<string, PlayerLike> }).players;
}
function me(room: Room): PlayerLike {
  return players(room).get(room.sessionId)!;
}
function eggs(room: Room) {
  return (room.state as { eggs: Map<string, EggLike> }).eggs;
}
function guardian(room: Room) {
  return [...(room.state as { guardians: Map<string, GuardianLike> }).guardians.values()][0];
}
function isNight(room: Room) {
  return (room.state as { isNight: boolean }).isNight;
}
function traps(room: Room) {
  return (room.state as { traps: Map<string, TrapLike> }).traps;
}

/** Waits until `cond` holds (polling), up to `ms`. Returns whether it held. */
async function until(cond: () => boolean, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await sleep(50);
  }
  return cond();
}

/** Corridor entry is blocked server-side during night; wait it out before anything that needs to walk in. */
async function waitForDay(room: Room) {
  if (isNight(room)) await until(() => !isNight(room), 50_000);
}

/** Sends DevSpeed until walk speed is fast enough to outrun the forest guardian (or resets to 0). */
async function setFast(bot: Bot, fast: boolean) {
  if (!fast) bot.room.send(MSG.DevSpeed, "reset");
  else for (let i = 0; i < 3; i++) bot.room.send(MSG.DevSpeed, "up");
  await until(() => (fast ? me(bot.room).speedStat >= 1000 : me(bot.room).speedStat === 0), 2000);
}

/** Plant → grow → hatch → income → equip/unequip, using the egg secured by the heist checks. */
async function penChecks(bot: Bot, results: [string, boolean][]) {
  const room = bot.room;
  const P = () => me(room);
  await until(() => !!bot.inventory && bot.inventory.eggs.length === P().eggCount, 2000);
  results.push([`inventory lists backpack eggs (${bot.inventory?.eggs.length} egg, ${bot.inventory?.slots} slots)`, !!bot.inventory && bot.inventory.eggs.length >= 1 && bot.inventory.slots === 4]);

  // Placing is now equip (from the backpack) + use (F) — no more aimed x/z or index.
  const eggUid0 = bot.inventory!.eggs[0].uid;
  room.send(MSG.EquipTool, { tool: "egg", eggUid: eggUid0 });
  await until(() => P().equipped === "egg" && P().equippedEggUid === eggUid0, 500);
  results.push([`equip a backpack egg`, P().equipped === "egg"]);

  const notes0 = bot.notes.length;
  room.send(MSG.Plant); // still standing outside the pen (at spawn)
  await until(() => bot.notes.length > notes0, 1000);
  results.push([`placing outside my pen refused ("${bot.notes[notes0]?.text}")`, P().penEggs.size === 0 && P().equipped === "egg"]);

  const eggsBefore = P().eggCount;
  const plot = basePlot(P().baseIndex);
  await walkTo(bot, plot.cx, 0, plot.cz);
  room.send(MSG.Plant);
  await until(() => P().penEggs.size === 1, 1500);
  const planted = [...P().penEggs.values()][0];
  results.push([
    `place the equipped egg in my pen (${planted?.defId}, ready in ${planted?.readyIn}s, backpack ${eggsBefore} -> ${P().eggCount})`,
    !!planted && planted.readyIn > 0 && P().eggCount === eggsBefore - 1 && P().equipped === "" && Math.abs(planted.x - plot.cx) < 10 && Math.abs(planted.z - plot.cz) < 11,
  ]);

  const [eggUid] = [...P().penEggs.keys()];
  const notes1 = bot.notes.length;
  room.send(MSG.Hatch, eggUid);
  await until(() => bot.notes.length > notes1, 1000);
  results.push([`hatching early refused`, P().penEggs.size === 1 && bot.hatched.length === 0]);

  room.send(MSG.DevGrow);
  await until(() => P().penEggs.get(eggUid)?.readyIn === 0, 1500);
  room.send(MSG.Hatch, eggUid);
  await until(() => bot.hatched.length === 1, 1500);
  const pet = bot.hatched[0]?.pet;
  await until(() => P().pets.size === 1 && P().income === pet?.income, 1000); // state patch lands just after the message
  results.push([`hatch -> ${pet?.species} (${pet?.weight}kg, $${pet?.income}/s${pet?.mutation ? ", " + pet.mutation : ""}, new=${bot.hatched[0]?.isNew})`, !!pet && P().pets.size === 1 && P().penEggs.size === 0 && P().income === pet.income]);

  const m0 = P().money;
  await sleep(2200);
  const earned = P().money - m0;
  results.push([`pen pays income (+$${earned} in ~2 s at $${P().income}/s)`, earned >= P().income && earned <= P().income * 3]);

  room.send(MSG.Unequip, pet.uid);
  await until(() => P().pets.size === 0, 1000);
  results.push([`unequip: pet leaves the pen, income 0`, P().pets.size === 0 && P().income === 0]);
  room.send(MSG.EquipBest);
  await until(() => P().pets.size === 1, 1000);
  results.push([`Equip Best puts it back`, P().pets.size === 1 && P().income === pet.income]);

  // A lucky hatch (e.g. a Bear) can already afford the first slot, so check whichever case applies.
  const notes2 = bot.notes.length;
  const cost = slotCost(4);
  const rich = P().money >= cost;
  const money0 = P().money;
  room.send(MSG.BuySlot);
  await until(() => bot.notes.length > notes2, 1000);
  results.push(
    rich
      ? [`buy a slot ($${cost}): 4 -> ${P().penSlots} slots`, P().penSlots === 5 && P().money < money0]
      : [`buying a slot without enough money refused ($${Math.floor(P().money)} < $${cost})`, P().penSlots === 4],
  );
}

/** Upgrades, trails, fusing, selling, the Gems Shop and Index rewards (Phase 5). */
async function progressChecks(bot: Bot, results: [string, boolean][]) {
  const room = bot.room;
  const P = () => me(room);
  const plot = basePlot(P().baseIndex);
  const inv = () => bot.inventory!;

  const notes0 = bot.notes.length;
  room.send(MSG.UpgradeTreadmill);
  await until(() => bot.notes.length > notes0, 1000);
  results.push([`treadmill upgrade refused away from its sign ("${bot.notes[notes0]?.text}")`, P().treadmillLevel === 1]);

  const m0 = P().money;
  room.send(MSG.DevMoney);
  await until(() => P().money >= m0 + 1_000_000, 1000);

  await walkTo(bot, plot.treadmillSign.x - 1, 0, plot.treadmillSign.z);
  const m1 = P().money;
  room.send(MSG.UpgradeTreadmill);
  await until(() => P().treadmillLevel === 2, 1000);
  results.push([`treadmill upgraded to level ${P().treadmillLevel} for $${Math.round(m1 - P().money)}`, P().treadmillLevel === 2 && Math.abs(m1 - P().money - 1_000) <= P().income * 3 + 1]); // pets keep earning meanwhile

  await walkTo(bot, plot.penSign.x, 0, plot.penSign.z + 1);
  room.send(MSG.UpgradePen);
  await until(() => P().penLevel === 2, 1000);
  results.push([`pen upgraded to level ${P().penLevel} (wooden fence, +10% income)`, P().penLevel === 2]);

  const trails = useSpot(HUB_BUILDINGS.trails);
  await walkTo(bot, plot.spawn.x, 0, plot.spawn.z + 12);
  await walkTo(bot, trails.x, 0, trails.z);
  room.send(MSG.BuyTrail, "grey");
  await until(() => P().trail === "grey", 1000);
  results.push([`buy + equip Grey Trail at the Trails Shop`, P().trail === "grey" && inv().trailsOwned.includes("grey")]);

  // Free chest: claim once (new profile, so it starts ready), then refused again until the cooldown passes.
  // Read the reward off the notify text (not a money diff) so the pen's own $/s ticks in the background can't confound it.
  const chest = useSpot(HUB_BUILDINGS.chest);
  await walkTo(bot, chest.x, 0, chest.z);
  const chestNotes0 = bot.notes.length;
  room.send(MSG.ClaimChest);
  await until(() => bot.notes.length > chestNotes0, 1500);
  const chestNote = bot.notes[chestNotes0]?.text ?? "";
  const gained = Number(chestNote.match(/\+\$(\d+)/)?.[1]);
  results.push([`claim the Free Chest ("${chestNote}")`, gained >= CHEST.moneyMin && gained <= CHEST.moneyMax]);

  const chestNotes1 = bot.notes.length;
  room.send(MSG.ClaimChest);
  await sleep(300);
  results.push([`Free Chest refuses a second claim before its cooldown`, bot.notes.length === chestNotes1]);

  // Fuse: 3 Chicks -> 1 heavier Chick.
  const petsBefore = inv().pets.length;
  for (let i = 0; i < 3; i++) room.send(MSG.DevPet, "forest_chick");
  await until(() => inv().pets.length === petsBefore + 3, 1500);
  const chicks = inv().pets.filter((x) => x.species === "forest_chick" && !x.equipped).slice(-3);
  const fuse = useSpot(HUB_BUILDINGS.fuse);
  await walkTo(bot, fuse.x, 0, fuse.z);
  room.send(MSG.Fuse, chicks.map((x) => x.uid));
  await until(() => bot.fused.length === 1, 1500);
  const fused = bot.fused[0]?.pet;
  const expected = +(chicks.reduce((a, x) => a + x.weight, 0) * 0.8).toFixed(1);
  results.push([`fuse 3 Chicks -> 1 Chick of ${fused?.weight}kg (pets ${petsBefore + 3} -> ${inv().pets.length})`, !!fused && fused.weight === expected && inv().pets.length === petsBefore + 1]);

  // Sell the fused chick.
  const sell = useSpot(HUB_BUILDINGS.sell);
  await walkTo(bot, sell.x, 0, sell.z);
  const m2 = P().money;
  room.send(MSG.Sell, [fused.uid]);
  await until(() => inv().pets.length === petsBefore && P().money > m2, 1500); // message + state patch
  const got = P().money - m2;
  results.push([`sell it at the SELL stall for $${Math.round(got)} (= $/s × ${SELL_MULT})`, inv().pets.length === petsBefore && got >= fused.income * SELL_MULT]);

  // Shop with Gems. (Baseline off whatever we're holding — the chest above may have thrown in a random Gems bonus.)
  const gems0 = inv().gems;
  room.send(MSG.DevGems);
  await until(() => inv().gems >= gems0 + 100, 1000);
  const eggs0 = P().eggCount;
  const bundle = FEATURED.bundles[0];
  room.send(MSG.ShopBuy, { item: "featured", count: bundle.count });
  await until(() => P().eggCount === eggs0 + bundle.count, 1000);
  results.push([`buy a Featured egg for ${bundle.gems} gems (gems ${inv().gems}, backpack ${eggs0} -> ${P().eggCount})`, P().eggCount === eggs0 + bundle.count && inv().gems === gems0 + 100 - bundle.gems]);
  room.send(MSG.ShopBuy, { item: "boost10" });
  await until(() => inv().boostLeft > 0, 1000);
  results.push([`x2 Speed boost active (${inv().boostLeft}s left)`, inv().boostLeft > 590]);

  // Index rewards.
  const claimable = inv().discovered.filter((s) => !inv().claimed.includes(s)).length;
  const s0 = P().speedStat;
  room.send(MSG.ClaimIndex, "all");
  await until(() => inv().claimed.length >= claimable && claimable > 0 && P().speedStat > s0, 1500);
  results.push([`claim ${claimable} Index rewards (+${Math.round(P().speedStat - s0)} Speed)`, claimable > 0 && P().speedStat > s0 && inv().claimed.length === inv().discovered.length]);

  room.send(MSG.DevSpeed, "reset");
  await until(() => P().speedStat === 0, 1000);
  await walkTo(bot, plot.spawn.x, 0, plot.spawn.z + 12);
  await walkTo(bot, plot.spawn.x, 0, plot.spawn.z);
}

/**
 * Full steal loop against the Forest guardian:
 * escape and secure, caught inside the biome (egg goes home), caught outside (egg stays loose), re-grab.
 */
async function heistChecks(bot: Bot, results: [string, boolean][]) {
  const room = bot.room;
  const G = () => guardian(room);
  // Biomes vary in length; derive waypoints from the real config instead of numbers baked in for the old fixed size.
  const forestHome = GUARDIANS.find((g) => g.biome === "forest")!.home;
  const lakeStartZ = biomeStartZ(BIOMES.findIndex((b) => b.id === "lake"));
  // Every biome has its own 6-nest guardian now; this suite only drives the Forest one, so scope checks to its nests (0-5).
  const forestEggs = () => [...eggs(room).values()].filter((e) => e.nest < 6);

  results.push([`6 eggs in Forest nests, guardian asleep`, forestEggs().length === 6 && forestEggs().every((e) => e.state === EggStatus.InNest) && G().mode === GuardianMode.Sleep]);

  // Too far away -> refused.
  const [farId] = [...eggs(room).keys()];
  room.send(MSG.Steal, farId);
  await until(() => bot.notes.length > 0, 1000);
  results.push([`steal from far away refused ("${bot.notes[0]?.text}")`, eggs(room).get(farId)!.state === EggStatus.InNest && !me(room).carrying]);

  const nearestEgg = () => {
    const p = me(room);
    return [...eggs(room).entries()]
      .filter(([, e]) => e.state === EggStatus.InNest || e.state === EggStatus.Loose)
      .sort(([, a], [, b]) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  };
  const stealNearest = async () => {
    const [id, e] = nearestEgg();
    await walkTo(bot, e.x + 1, 0, e.z - 1);
    room.send(MSG.Steal, id);
    await until(() => me(room).carrying === id, 1000);
    return id;
  };

  // --- A: steal, outrun the guardian, secure at the safe zone.
  await setFast(bot, true);
  await walkTo(bot, 0, 0, -10); // through the corridor mouth, not the hub's front wall
  await walkTo(bot, 0, 0, forestHome.z);
  const idA = await stealNearest();
  results.push([`steal egg ${idA} (carrying=${me(room).carrying})`, me(room).carrying === idA && eggs(room).get(idA)?.state === EggStatus.Carried]);
  await until(() => G().mode === GuardianMode.Alert, 1000);
  results.push([`guardian wakes up (mode ${G().mode} = Alert)`, G().mode === GuardianMode.Alert]);
  await until(() => G().mode === GuardianMode.Chase, 2500);
  results.push([`guardian chases the thief`, G().mode === GuardianMode.Chase && G().target === room.sessionId]);
  const eggsBefore = me(room).eggCount;
  await walkTo(bot, me(room).x, 0, SAFE_ZONE_Z - 4);
  await until(() => bot.secured.length > 0, 1500);
  results.push([`reach safe zone -> egg secured (inventory ${eggsBefore} -> ${me(room).eggCount})`, bot.secured.length === 1 && me(room).eggCount === eggsBefore + 1 && !eggs(room).has(idA) && bot.knocks.length === 0]);
  await until(() => G().mode === GuardianMode.Return || G().mode === GuardianMode.Sleep, 1500);
  results.push([`guardian gives up and heads home`, G().mode === GuardianMode.Return || G().mode === GuardianMode.Sleep]);

  // --- B: caught inside the forest -> the guardian carries the egg back to its nest.
  await walkTo(bot, 0, 0, forestHome.z);
  await until(() => G().mode === GuardianMode.Sleep, 20000);
  const idB = await stealNearest();
  await setFast(bot, false);
  const walkAway = walkTo(bot, me(room).x, 0, 60).catch(() => {});
  const caught = await until(() => bot.knocks.length === 1, 12000);
  await walkAway;
  const eB = eggs(room).get(idB);
  results.push([`slow thief gets hit inside the forest (knock ${bot.knocks[0] ? Math.round(Math.hypot(bot.knocks[0].vx, bot.knocks[0].vz)) : "-"} u/s)`, caught && !me(room).carrying && !!eB && eB.state !== EggStatus.Carried]);
  const home = await until(() => eggs(room).get(idB)?.state === EggStatus.InNest, 25000);
  results.push([`guardian fetches the egg back to its nest`, home]);

  // --- C: caught outside the forest (in the Lake) -> egg stays loose, guardian goes home.
  await setFast(bot, true);
  await until(() => G().mode === GuardianMode.Sleep, 20000);
  const idC = await stealNearest();
  // Run up the side of the corridor, away from the guardian's sleeping spot in the middle.
  const side = me(room).x < 0 ? -26 : 26;
  await walkTo(bot, side, 0, me(room).z);
  await walkTo(bot, side, 0, lakeStartZ + 20);
  await setFast(bot, false);
  const caughtC = await until(() => bot.knocks.length === 2, 15000);
  await sleep(EGG_RULES.stunSec * 1000 + 300); // wait out the stun (stunned players can't grab eggs)
  const eC = eggs(room).get(idC);
  results.push([`caught in the Lake -> egg stays loose there (state ${eC?.state})`, caughtC && eC?.state === EggStatus.Loose && eC.z > lakeStartZ]);
  results.push([`guardian leaves it and returns home (mode ${G().mode})`, G().mode === GuardianMode.Return || G().mode === GuardianMode.Sleep]);

  // --- D: picking up the loose egg makes its guardian chase again.
  await setFast(bot, true);
  await walkTo(bot, eC!.x + 1, 0, eC!.z);
  room.send(MSG.Steal, idC);
  await until(() => me(room).carrying === idC, 1000);
  const reAggro = await until(() => (G().mode === GuardianMode.Chase || G().mode === GuardianMode.Alert) && G().target === room.sessionId, 2000);
  results.push([`re-grabbing the loose egg re-aggroes the guardian`, me(room).carrying === idC && reAggro]);
  // (Running back now would go head-on into the guardian coming up the corridor.) Drop it instead.
  room.send(MSG.Drop);
  await until(() => eggs(room).get(idC)?.state === EggStatus.Loose, 1000);
  const gaveUp = await until(() => G().mode === GuardianMode.Return || G().mode === GuardianMode.Sleep, 2000);
  results.push([`Drop button: egg left loose in the Lake, guardian goes home`, eggs(room).get(idC)?.state === EggStatus.Loose && gaveUp]);
  await walkTo(bot, me(room).x, 0, SAFE_ZONE_Z - 4);
  await setFast(bot, false);
  await walkTo(bot, basePlot(me(room).baseIndex).spawn.x, 0, basePlot(me(room).baseIndex).spawn.z);
}

/** Bat hit: swinging at a nearby carrier (outside the safe zone) makes them drop their egg and knocks them back. */
async function pvpChecks(a: Bot, b: Bot, results: [string, boolean][]) {
  const roomA = a.room;
  const roomB = b.room;
  const nest = NESTS.find((n) => n.guardian === "forest_hen")!;

  // B waits right next to the nest so it can swing the instant A steals.
  await setFast(b, true);
  await walkTo(b, nest.x + 2, 0, nest.z);
  await setFast(b, false);

  // A grabs the egg at that nest, right next to B.
  await setFast(a, true);
  await walkTo(a, nest.x, 0, nest.z);
  const nearId = [...eggs(roomA).entries()].find(([, e]) => Math.hypot(e.x - nest.x, e.z - nest.z) < 1)?.[0];
  if (!nearId) {
    results.push(["PvP setup: found an egg at the test nest", false]);
    return;
  }
  roomA.send(MSG.Steal, nearId);
  const stole = await until(() => me(roomA).carrying === nearId, 1000);
  results.push([`PvP setup: A steals the egg next to B`, stole]);

  // B equips the bat first: swinging bare-handed is refused server-side.
  roomB.send(MSG.EquipTool, { tool: "bat" });
  await until(() => me(roomB).equipped === "bat", 500);
  results.push([`equip the bat`, me(roomB).equipped === "bat"]);

  // B faces A exactly (a Move message can set ry without needing to walk) and swings.
  const posA = me(roomA);
  const posB = me(roomB);
  roomB.send(MSG.Move, { x: posB.x, y: 0, z: posB.z, ry: Math.atan2(posA.x - posB.x, posA.z - posB.z), anim: Anim.Idle } satisfies MoveMsg);
  await until(() => Math.abs(me(roomB).ry - Math.atan2(posA.x - posB.x, posA.z - posB.z)) < 0.05, 500);
  // A may already have prior knocks from the guardian earlier in heistChecks — track the baseline, don't just check > 0.
  const knocksBase = a.knocks.length;
  roomB.send(MSG.BatHit);
  // The Knock message and the egg's schema patch travel separately; wait for both to land.
  await until(() => a.knocks.length > knocksBase && eggs(roomA).get(nearId)?.state === EggStatus.Loose, 1000);
  const hit = a.knocks[a.knocks.length - 1];
  const eggAfter = eggs(roomA).get(nearId);
  results.push([
    `bat hit: carrier drops the egg (state ${eggAfter?.state}, by "${hit?.by}", droppedEgg ${hit?.droppedEgg})`,
    !me(roomA).carrying && eggAfter?.state === EggStatus.Loose && hit?.by === "Check2" && hit?.kind === "bat" && hit?.droppedEgg === true,
  ]);

  // Clean up: wait out A's stun, then let the guardian fetch the loose egg home before the next checks run.
  await sleep(PVP.stunSec * 1000 + 300);
  await until(() => eggs(roomA).get(nearId)?.state === EggStatus.InNest, 25000);

  // A is now empty-handed (race-to-the-egg case): the bat should still work on a non-carrier, just without claiming an egg dropped.
  await sleep(PVP.cooldownSec * 1000); // B's bat cooldown from the first swing
  const knocksBase2 = a.knocks.length;
  roomB.send(MSG.BatHit);
  await until(() => a.knocks.length > knocksBase2, 1000);
  const hit2 = a.knocks[a.knocks.length - 1];
  results.push([
    `bat hit works on a non-carrier too (by "${hit2?.by}", droppedEgg ${hit2?.droppedEgg})`,
    !me(roomA).carrying && hit2?.kind === "bat" && hit2?.by === "Check2" && !hit2?.droppedEgg,
  ]);

  await sleep(PVP.stunSec * 1000 + 300); // let A's stun from this second hit pass before later checks move it around
  roomB.send(MSG.EquipTool, { tool: "" });
}

/** Traps: place one outside the safe zone (owner is immune), another player stepping on it gets caught; refused inside the safe zone. */
async function trapChecks(a: Bot, b: Bot, results: [string, boolean][]) {
  const roomA = a.room;
  const roomB = b.room;

  roomA.send(MSG.EquipTool, { tool: "trap" });
  await until(() => me(roomA).equipped === "trap", 500);
  results.push([`equip the trap`, me(roomA).equipped === "trap"]);

  const trapsBefore = me(roomA).trapsAvailable;
  const spot = { x: me(roomA).x, z: me(roomA).z };
  roomA.send(MSG.PlaceTrap);
  await until(() => traps(roomA).size > 0, 1000);
  results.push([
    `place a trap in the Forest (charges ${trapsBefore} -> ${me(roomA).trapsAvailable})`,
    traps(roomA).size === 1 && me(roomA).trapsAvailable === trapsBefore - 1,
  ]);

  // Standing right where it placed its own trap doesn't trigger it.
  await sleep(300);
  results.push([`owner standing on their own trap doesn't trigger it`, traps(roomA).size === 1]);

  // B walks onto it and gets caught.
  await setFast(b, true);
  const knocksBase = b.knocks.length;
  await walkTo(b, spot.x, 0, spot.z);
  await until(() => b.knocks.length > knocksBase, 2000);
  const hit = b.knocks[b.knocks.length - 1];
  // B was never carrying an egg here — the trap still catches you, it just shouldn't claim you dropped one.
  results.push([`step on Check1's trap (kind "${hit?.kind}", by "${hit?.by}", droppedEgg ${hit?.droppedEgg})`, hit?.kind === "trap" && hit?.by === "Check1" && !hit?.droppedEgg]);
  results.push([`triggered trap is removed from the world`, traps(roomA).size === 0]);

  // Cleanup, then: refused inside the safe zone.
  await sleep(TRAP.stunSec * 1000 + 300);
  await walkTo(b, spot.x, 0, SAFE_ZONE_Z - 4);
  await setFast(b, false);

  await setFast(a, true);
  await walkTo(a, spot.x, 0, SAFE_ZONE_Z - 6);
  await setFast(a, false);
  const trapsBefore2 = me(roomA).trapsAvailable;
  const notes0 = a.notes.length;
  roomA.send(MSG.PlaceTrap);
  await until(() => a.notes.length > notes0, 800);
  results.push([
    `trap refused in the safe zone ("${a.notes[notes0]?.text}")`,
    me(roomA).trapsAvailable === trapsBefore2 && traps(roomA).size === 0,
  ]);

  roomA.send(MSG.EquipTool, { tool: "" });
  await walkTo(a, basePlot(me(roomA).baseIndex).spawn.x, 0, basePlot(me(roomA).baseIndex).spawn.z);
}

/** Walks a bot to a point at a legal speed (20 updates/s), like a real client would. */
async function walkTo(bot: Bot, x: number, y: number, z: number) {
  const p = { x: me(bot.room).x, z: me(bot.room).z };
  const step = walkSpeedFromStat(me(bot.room).speedStat) * 0.8 * 0.05;
  for (;;) {
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) break;
    const s = Math.min(d, step);
    p.x += (dx / d) * s;
    p.z += (dz / d) * s;
    bot.room.send(MSG.Move, { x: p.x, y: d - s < 0.01 ? y : 0, z: p.z, ry: Math.atan2(dx, dz), anim: Anim.Run } satisfies MoveMsg);
    await sleep(50);
  }
  // Wait until the server state reflects the final position (so later reads aren't stale).
  for (let i = 0; i < 40; i++) {
    const s = me(bot.room);
    if (Math.abs(s.x - x) < 0.02 && Math.abs(s.z - z) < 0.02 && Math.abs(s.y - y) < 0.02) return;
    await sleep(50);
  }
  throw new Error(`walkTo(${x}, ${y}, ${z}) never confirmed by the server`);
}

/** Holds a position for `ms`, sending the given animation state 20×/s. */
async function hold(bot: Bot, anim: Anim, ms: number) {
  const { x, y, z } = me(bot.room);
  const end = Date.now() + ms;
  while (Date.now() < end) {
    bot.room.send(MSG.Move, { x, y, z, ry: 0, anim } satisfies MoveMsg);
    await sleep(50);
  }
}

async function runBots() {
  if (check) return runChecks();

  const bots = await Promise.all(Array.from({ length: count }, (_, i) => join(`Bot${i + 1}`, `botjogger-${i + 1}`)));
  console.log(`[bots] ${bots.length} bots joined`);

  // Each bot walks (at a legal speed) toward a point circling in front of a base.
  const pos = bots.map(({ room }) => ({ x: me(room).x, z: me(room).z }));
  bots.forEach((bot, i) => (bot.onCorrect = (m) => (pos[i] = { x: m.x, z: m.z })));
  const t0 = Date.now();
  const dt = 0.05;
  setInterval(() => {
    const t = (Date.now() - t0) / 1000;
    for (const [i, { room }] of bots.entries()) {
      if (!players(room).has(room.sessionId)) continue;
      const walk = walkSpeedFromStat(me(room).speedStat) * 0.9;
      const plot = basePlot(process.env.BOT_BASE ? Number(process.env.BOT_BASE) : me(room).baseIndex);
      const a = t * 0.8 + i * ((Math.PI * 2) / bots.length);
      const tx = plot.spawn.x + Math.cos(a) * 5 - pos[i].x;
      const tz = plot.spawn.z + 6 + Math.sin(a) * 5 - pos[i].z;
      const d = Math.hypot(tx, tz);
      const step = Math.min(d, walk * dt);
      if (d > 0.001) {
        pos[i].x += (tx / d) * step;
        pos[i].z += (tz / d) * step;
      }
      const msg: MoveMsg = { x: pos[i].x, y: 0, z: pos[i].z, ry: Math.atan2(tx, tz), anim: step > 0.01 ? Anim.Run : Anim.Idle };
      room.send(MSG.Move, msg);
    }
  }, dt * 1000);
  console.log("[bots] jogging… Ctrl+C to stop");
}

async function runChecks() {
  const run = Math.random().toString(36).slice(2, 10);
  const pid = (i: number) => `check${run}-${i}`;
  const first = await join("Check1", pid(1), "new");
  const others = await Promise.all(Array.from({ length: count - 1 }, (_, i) => join(`Check${i + 2}`, pid(i + 2), first.room.roomId)));
  const bots = [first, ...others];
  await sleep(300);

  const results: [string, boolean][] = [];
  const [a, b] = bots;

  // --- Phase 1: multiplayer + anti-cheat
  const seen = players(b.room).size;
  results.push([`bot 2 sees ${seen}/${count} players`, seen === count]);

  const bases = new Set(bots.map(({ room }) => me(room).baseIndex));
  results.push([`unique bases (${[...bases].join(",")})`, bases.size === count]);

  const start = me(a.room);
  const target = { x: start.x + 0.3, z: start.z + 0.3 };
  a.room.send(MSG.Move, { x: target.x, y: 0, z: target.z, ry: 0, anim: Anim.Run } satisfies MoveMsg);
  await sleep(250);
  const aSeenByB = players(b.room).get(a.room.sessionId)!;
  results.push([`legal move replicated (${aSeenByB.x.toFixed(2)}, ${aSeenByB.z.toFixed(2)})`, Math.abs(aSeenByB.x - target.x) < 0.01 && a.corrections.length === 0]);

  a.room.send(MSG.Move, { x: target.x, y: 0, z: 1500, ry: 0, anim: Anim.Run } satisfies MoveMsg);
  await sleep(250);
  results.push([`teleport rejected (${a.corrections.length} correction)`, a.corrections.length === 1 && me(a.room).z < 0]);

  a.room.send(MSG.Move, { x: 150, y: 0, z: start.z, ry: 0, anim: Anim.Run } satisfies MoveMsg);
  await sleep(250);
  results.push([`out-of-bounds rejected`, a.corrections.length === 2]);

  // --- Phase 2: treadmill
  const tm = basePlot(me(a.room).baseIndex).treadmill;
  await walkTo(a, tm.x, TREADMILL_SHAPE.deckTop, tm.z);
  const before = me(a.room).speedStat;
  await hold(a, Anim.Idle, 1000);
  results.push([`standing still on belt earns nothing (+${me(a.room).speedStat - before})`, me(a.room).speedStat === before]);

  await hold(a, Anim.Run, 2000);
  const gained = me(a.room).speedStat - before;
  // 4 steps/s × 2 per step × 2 s ≈ 16 (timing jitter allowed).
  results.push([`running on own belt earns Speed (+${gained} in 2 s, training=${me(a.room).training})`, gained >= 10 && gained <= 24]);

  // Stopping input stops training (no AFK credit from a frozen/background tab).
  await sleep(500);
  const afterStop = me(a.room).speedStat;
  await sleep(1000);
  results.push([`no Speed without live input (+${me(a.room).speedStat - afterStop} in 1 s idle)`, me(a.room).speedStat === afterStop && !me(a.room).training]);

  // --- Phase 3: stealing and the guardian (skip with NO_HEIST=1)
  if (!process.env.NO_HEIST) {
    await waitForDay(a.room); // night seals off the corridor; don't fight the lockdown
    await heistChecks(a, results);
    await pvpChecks(a, b, results);
    await trapChecks(a, b, results);
    await penChecks(a, results);
    await progressChecks(a, results);
  }

  // --- Phase 2: persistence
  const saved = me(a.room).speedStat;
  const savedEggs = me(a.room).eggCount;
  const savedPets = me(a.room).pets.size;
  await a.room.leave();
  await sleep(300);
  const a2 = await join("Check1", pid(1), first.room.roomId);
  await sleep(300);
  results.push([
    `progress saved across rejoin (speed ${me(a2.room).speedStat} = ${saved}, eggs ${me(a2.room).eggCount} = ${savedEggs}, pets in pen ${me(a2.room).pets.size} = ${savedPets})`,
    me(a2.room).speedStat === saved && me(a2.room).eggCount === savedEggs && me(a2.room).pets.size === savedPets,
  ]);

  // --- Phase 2: same profile in a second tab takes over
  const a3 = await join("Check1", pid(1), first.room.roomId);
  await sleep(400);
  results.push([`second tab takes over (old closed with ${a2.leaveCode}, new has ${me(a3.room).speedStat})`, a2.leaveCode === CLOSE.TakenOver && me(a3.room).speedStat === saved]);

  // --- cleanup: leaving removes the player
  const sizeBefore = players(a3.room).size;
  await b.room.leave();
  await sleep(250);
  const left = players(a3.room).size;
  results.push([`leave removes player (${sizeBefore} → ${left})`, left === sizeBefore - 1]);

  for (const [name, ok] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  for (const bot of [a3, ...others]) if (bot.room.connection.isOpen) await bot.room.leave();
  await sleep(300);
  // Remove this run's test profiles (the server writes them to server/data/profiles).
  const dir = fileURLToPath(new URL("../../data/profiles", import.meta.url));
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) if (f.startsWith(`check${run}`)) fs.rmSync(`${dir}/${f}`, { force: true });
  process.exit(results.every(([, ok]) => ok) ? 0 : 1);
}

runBots().catch((e) => {
  console.error("[bots] failed:", e.message ?? e);
  process.exit(1);
});
