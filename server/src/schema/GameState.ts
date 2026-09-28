import { MapSchema, Schema, type } from "@colyseus/schema";

/** A pet standing in someone's pen (everyone sees these). Where it wanders is up to each client. */
export class PenPetState extends Schema {
  @type("string") species = "";
  @type("float32") weight = 0;
  @type("string") mutation = "";
  @type("float64") income = 0;
}

/** An egg growing in someone's pen. */
export class PenEggState extends Schema {
  @type("string") defId = "";
  @type("float32") size = 1;
  @type("float32") x = 0;
  @type("float32") z = 0;
  @type("uint32") growSec = 0;
  /** Seconds left until it can hatch (0 = ready). Updated by the server once a second. */
  @type("uint32") readyIn = 0;
}

/** Public, synced data for one player. Private data (backpack, benched pets) never goes here. */
export class PlayerState extends Schema {
  @type("string") name = "";
  @type("uint8") baseIndex = 0;
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") z = 0;
  @type("float32") ry = 0;
  @type("uint8") anim = 0;
  @type("float64") speedStat = 0;
  @type("float64") money = 0;
  /** Total $/s of the pets in this player's pen. */
  @type("float64") income = 0;
  @type("uint8") treadmillLevel = 1;
  /** True while this player is running on their own treadmill belt (server-decided). */
  @type("boolean") training = false;
  @type("boolean") slowMode = false;
  /** Id of the egg this player carries ("" = none). */
  @type("string") carrying = "";
  /** Secured eggs waiting in the backpack (not planted yet). */
  @type("uint16") eggCount = 0;
  @type("uint8") penSlots = 4;
  /** Fence tier 1–5 (visual + income bonus). */
  @type("uint8") penLevel = 1;
  /** Equipped trail id ("" = none): everyone sees it, and it speeds up movement. */
  @type("string") trail = "";
  /** Pets in the pen, keyed by pet uid. */
  @type({ map: PenPetState }) pets = new MapSchema<PenPetState>();
  /** Eggs growing in the pen, keyed by egg uid. */
  @type({ map: PenEggState }) penEggs = new MapSchema<PenEggState>();
}

export class EggState extends Schema {
  @type("string") defId = "";
  /** Visual size multiplier. */
  @type("float32") size = 1;
  /** EggStatus. */
  @type("uint8") state = 0;
  /** Session id of the player carrying it (state = Carried). */
  @type("string") carrier = "";
  @type("uint8") nest = 0;
  /** World position when in a nest or loose. Carried eggs follow their carrier on the client. */
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") z = 0;
}

export class GuardianState extends Schema {
  @type("string") defId = "";
  @type("float32") x = 0;
  @type("float32") z = 0;
  @type("float32") ry = 0;
  /** GuardianMode. */
  @type("uint8") mode = 0;
  /** Session id being chased ("" = none). */
  @type("string") target = "";
}

export class GameState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: EggState }) eggs = new MapSchema<EggState>();
  @type({ map: GuardianState }) guardians = new MapSchema<GuardianState>();
  /** Seconds until the next night / potion event (effects arrive in Phase 6). */
  @type("uint16") nightIn = 0;
  @type("uint16") potionIn = 0;
}
