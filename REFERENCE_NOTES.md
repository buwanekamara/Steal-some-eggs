# Reference Notes (from screenshots of the original game)

Observations only. We recreate the *mechanics and feel*, with original art, names and models.

---

## Part 1: Base layout (screenshots 2–12)

### Overall world layout
- The **spawn / hub area** is a big flat field: bright green ground with raised "stud" tiles, enclosed by **very tall brown checkered walls with a green top edge**.
- A **red line on the ground marks the SAFE ZONE**, with "SAFE ZONE" painted on the floor and blue accents. Everything behind it (bases, shops) is safe.
- Player bases (pens) sit **side by side** along the hub. Above each base floats a **big circular avatar headshot plus username** billboard, so you can tell whose base is whose from far away.
- The biome route is a **long straight corridor** leading away from the hub, walled on both sides. Each biome restyles the walls and floor (dark stone for the volcano/abyss area, blue stone temple walls with vines and torches for the temple area).

### The pen (the player's base)
- A rectangular **fenced pen**: orange-brown wooden fences with X-cross braces and dark stone posts, all built from blocky "brick" geometry.
- **Pets roam freely inside the pen.** There are no fixed pads; pets wander and idle. Pets are big, blocky, voxel/brick-textured animals (pink dog, blue shark, carrot creature, sand spider, owl…).
- **Pet sizes vary a lot:** the Common Dog is huge, bigger than the player (so size ≠ rarity).
- Each pet has a **floating billboard**:
  - Line 1: **Rarity**, color-coded (Common = white with dark outline, Rare = blue, Legendary = yellow/orange, Mythic = red).
  - Line 2: **Pet name** (e.g. "Dog", "Sand Spider").
  - Line 3: **Income** in green, e.g. `$50/s`, `$5.8K/s`, `$15K/s`.
  - Some pets show a mutation prefix in the name tag (e.g. "Gold…").
- **Income popups:** green `+$50`, `+$5.8K` floating text bursts from each pet on every payout tick. A huge `+$5.8K` fills the screen when the player is near/collecting, so money seems to be **collected automatically or by proximity**, with no collect button visible. *(To confirm with the user.)*
- **"Upgrade Pen" sign** inside the pen: dark blue board, "Level 1 > Level 2", green price button `$1M`. A pen upgrade most likely adds pet capacity or pen size.
- **A red "!" marker** floats over things that need attention or are affordable.

### Treadmill (next to the pen)
- A white/light-blue brick treadmill with a **glowing cyan animated belt**, standing on the grass.
- A floating label above the area reads **`+12/step`**: Speed is gained **per step** while running on it, not per second.
- An **"Upgrade" sign** beside it: "Level 3 > Level 4", **`$5M` (money) or `69` premium currency (purple button)**.

### Other hub buildings (shared, near the bases)
| Building | Look | Purpose (inferred) |
|---|---|---|
| **Fuse Machine** (label "1/3") | Blue sci-fi machine with a glowing "?" screen | Put in 3 pets and get a better/random one |
| **SELL** stand | Red-and-white striped awning stall, glowing **green circle pad** on the floor | Stand on the pad to sell pets/eggs for money |
| **Trails Shop** | Yellow-and-white awning stall, glowing **yellow circle pad** | Buy cosmetic trails |
| **FREE! chest** | Red and gold treasure chest with a sparkle | Timed free reward |
| **Most Money/s leaderboard** | Tall blue framed board with a player list (global, in trillions) | Global leaderboard |
| **Big locked machine** | Dark machine with green glowing tubes, chains and a keyhole | Unknown: locked feature/event (ask) |

### HUD
- **Bottom-left:** 👟 icon with a `+` → **Speed** (`50.7K`), and 💵 icon → **Money** (`$17.8M`). Huge chunky font, bright green fill, thick dark outline.
- **Left middle:** big buttons **Shop** (green, cart icon) and **Index** (blue, book icon, red notification badge `7`), plus a **"Slow Mode" toggle** (lets you walk slowly, since high Speed makes movement hard to control).
- **Right middle:** two square buttons: **Egg** (red, egg icon) = egg inventory, **Paw** (orange) = pet inventory. At night the egg button shows a **`x30`** badge with a moon.
- **Bottom-center hotbar:** slot 1 = **stick/bat tool** (probably used to hit and knock other players, so they drop eggs), slot 2 = an **item with `x3`** (eggs being carried? consumable?).
- **Top-right:** player list with columns **People / Money/s / Speed**.
- **Bottom-right:** **Day/night timer**: moon icon plus "in 3m 9s". When it hits zero, a **giant "5s" countdown with a moon-and-clouds graphic** appears center screen. Night appears to be an **event that multiplies eggs (x30)**. During the night, a sun icon counts down to day.
- Font style: very bold rounded display font (similar to *Fredoka One* / *Luckiest Guy*); everything has thick dark outlines.

### Biome corridor
- Speed requirements are **soft**: a wooden sign says **"👟 700K recommended"**. There's **no hard gate**; being too slow just means the guardian catches you.
- **Guardians sleep** in the middle of the path with a big **"ZZ" icon** above them (for example, a fiery spiky creature). Small eggs lie on the ground around them.
- The temple biome has a gate at the far end, volcanoes with lava, torches and palm trees.

### Art direction takeaways
- Everything is **blocky, made of bricks/studs** (LEGO-like surface texture on every material).
- Saturated colors, bright sky with cartoon clouds, strong sun shadows.
- Implementation idea: one **stud normal map/texture** tiled on all world materials gives the look cheaply.

---

## Changes to DEVELOPMENT_PLAN.md implied by Part 1
1. **Base = fenced pen with free-roaming pets** (simple wander AI on the client, positions not synced). No fixed pet pads.
2. **Pet billboards** (rarity/name/$/s) plus **income popups**.
3. **Treadmill gives Speed per step** (`+N/step`), upgradeable with money or premium currency.
4. **Pen upgrade** sign inside each pen.
5. **Soft biome gates** ("X recommended") instead of hard blocks.
6. **Guardian starts asleep (ZZ)** and wakes on theft.
7. New hub features: **Sell pad, Fuse Machine (3 → 1), Trails Shop, Free chest, global Money/s leaderboard, Safe Zone line**.
8. **Day/night cycle event**: night gives a big egg multiplier (x30) with a countdown banner.
9. HUD layout as above, including the **Slow Mode** toggle and a **hotbar with a hit tool**.
10. **Player list** showing Money/s and Speed.

---

## Open questions (Part 1)
- ~~Is money collected automatically?~~ **Answered in Part 2: automatic.** Popups appear on every pet all the time, and there's an offline-earnings banner.
- What do the hotbar items do (the stick/bat, and the `x3` pink spiky ring item)?
- What is the big chained green machine?
- What exactly does the night event do (x30 egg luck, more eggs, more money)?
- Does the Pen upgrade add pet capacity, make the pen bigger, or both? (Part 2 shows active pet slots are bought separately with "+1 EQUIP".)

---

## Part 2: HUD, pet management, stealing, carrying, hatching (screenshots 13–30)

### Treadmill feedback
- While you run on the treadmill, **blue `+24` numbers with little shoe icons** pop up around the player and fly toward the Speed counter. Speed per step went from +12 to +24 here, likely because of the equipped trail multiplier.
- The belt glows cyan under the player's feet.

### Monetization / promos in the HUD
- The **Shop button sometimes turns red**, and the Index slot is temporarily replaced by a **flashing promo button: "⚡ x2 Speed — ONLY 3 [premium]"**. It's a rotating upsell in the left button column.
- **Offline earnings banner** across the top: **"You earn $79M/Day offline! 😈"** (white text, money amount in green).

### Right-side management panel (opened by the Paw / Egg buttons)
One docked panel on the right edge with a red **`>`** button that collapses it. It has two modes:

**Pets mode: "Active pets"**
- Header: **`6/7 Active`** plus a green button **`+1 EQUIP [$1M]`** that buys one more active slot. The price scales ($75M at 7/9) and the button turns **red when you can't afford it**.
- List rows: pet icon, **name colored by rarity**, `($X/s)`, and a red **Unequip** button.
- **Equip Best** green button under the panel.
- **Only equipped ("active") pets stand in the pen and earn money.** Unequipped pets live in the backpack/hotbar.

**Eggs mode: "Growing Eggs"**
- Header **"Growing Eggs"** plus an orange/yellow **Grow All** button (paid instant-grow).
- Rows: egg icon plus a **green progress bar with time left** (`1m 4s`). When finished, the row shows a green **Open** button.

### Rarity colors (confirmed)
| Rarity | Label color |
|---|---|
| Common | white/grey |
| Uncommon | green |
| Rare | blue |
| Epic | purple/magenta |
| Legendary | yellow/orange |
| Mythic | red |

- **Mutations** show up as a name prefix and a material change: **"Golden Burrowing Owl"** is fully gold-colored.
- Pets have a **weight in Kg** (`Chicken (7Kg)`). That's the "size" stat, and bigger means more income.

### Hotbar / backpack
- A Roblox-style numbered hotbar (1–4+):
  - Slot 1: **bat** (hit tool).
  - Slot 2: **pink spiky ring `x3`** (unknown consumable, maybe a trap).
  - Further slots: **unequipped pets** (Chicken) and **carried/unplaced eggs**. Selecting one makes your character **hold it in their hands**.
- Freshly hatched pets land in the hotbar first. You then equip them.

### Fuse Machine UI
- World prompt: **"Fuse Machine — Fuse Pets"**, and a floating label **`0/3`** / **`1/3`** above the machine showing how many pets are loaded.
- Modal with a **purple gradient header, red X close button**, and a dark studded panel background:
  - Title text: **"Bring 3 same Pets to Fuse"** / **"Better pets give more Luck 🍀!"**
  - Three **"Empty" slots with big green `+` buttons**, connected by pipes to a **black mystery-pet silhouette** in the middle.
  - Bottom button: **"3 Pet Left"** (counts down as slots fill).
  - A side tooltip shows **3 small dogs ≈ 1 big dog**, with an **OK!** button. So **fusing 3 of the same species makes one heavier, more valuable version.**
- The picker is a grid titled **"Select Pets to Fuse!"**; each card shows the pet render, name and weight.

### Sell Pets UI
- Modal with a **green header, paw icon, "Sell Pets"** title and red X.
- Left column: **Sort By: Weight / Value** buttons, plus **Select All**.
- Grid of pet cards: weight (`7Kg`), render, `$1/s`, and sell price (`$100`).
- Footer: **Total Value: $0** and a **Sell** button (greyed out until something is selected).

### Trail Shop UI
- Purple header modal, horizontally scrolling **cards**, each colored to match its trail:
  - **Grey Trail** (Common) **x1.5 Speed**, button: Equip
  - **Green Trail** (Uncommon) **x2 Speed**, button: Unequip (equipped)
  - **Blue Trail** (Rare) **x2.5 Speed**, price: **$75K or 29 premium**
- Each card shows a blocky runner mannequin with the trail streaming behind it.
- **Trails are Speed multipliers**, not just cosmetics (this likely multiplies Speed gained per step).

### Timers (bottom-right, stacked)
- **🧪 Potion timer** (`in 14m 23s`), a second recurring event, probably a free potion/boost.
- **🌙 Night timer** (`in 4m 12s`), which turns **red in the last seconds** (`in 11s`).

### Stealing an egg
- Eggs sit in **brown twig nests** scattered on the ground around the guardian. There are several egg types and sizes per biome (desert: beige/brown striped eggs and a green cactus egg with sunglasses; snow: black-and-white eggs).
- A **ProximityPrompt "Egg — Steal" [E] with a hold ring**: you **hold E** to steal. On mobile it's a tap-hand icon.
- The **guardian sleeps next to the nests** (e.g. a huge brick **scorpion** in the desert with a blue "ZZ").

### Carrying / chase
- After the steal, the **egg sits on the player's back/head** (big, visible), and the HUD changes:
  - A big **"RUN!!"** banner at the top (dark red box, white text, red outline).
  - A **red vignette** around the screen edges.
  - A red **🗑 Drop** button at the bottom center.
  - The normal left and right HUD buttons are **hidden** during the chase.
- The **guardian wakes up (red "!" above its head)** and chases.
- Once you cross into the safe zone, the egg becomes a **held hotbar item** (carried in your hands).

### Growing and hatching
- You place the egg **inside your pen**. It shows a billboard with **"Egg" (magenta)** and a **countdown `1m 3s`**.
- The **egg grows physically larger** while incubating. When done, it's huge and shows **"Egg Ready!"**.
- Prompt **"Hatch!" [E]** on the egg, or the **Open** button in the Growing Eggs panel.
- **Hatch reveal is simple:** the pet appears in place with its billboard (e.g. `Tob Tobi Tob Tob — $309/s`), the **Index badge increments (7 → 8)** for a new discovery, and the pet goes into the hotbar. There's **no fullscreen reveal screen** (we could add a nicer one as our own improvement).

### Mobile HUD differences
- Everything is scaled down. Shop, Index and Slow Mode are on the left, the Egg and Paw buttons on the right.
- A **large circular Jump button** at the bottom-right, plus a **shift-lock (padlock) button** under it.
- Timers sit bottom-right, stacked above the jump button.
- The hotbar is centered at the bottom and shows only the first slots.
- Proximity prompts use a **tap-hand icon** instead of a key letter.
- The movement joystick appears dynamically where you touch (Roblox default), so it isn't visible when idle.

### Biomes glimpsed in Part 2
- **Desert:** sand-colored studded floor, yellow/brown checker walls, cacti, sand pyramids. Guardian: **giant scorpion**.
- **Grass/lake area** further on: pond, reeds, a **fiery-maned dino/lizard** guardian.
- **Snow:** white studded floor. Guardian: a **huge white furry winged beast** with black claws.
- **Lava area** after snow: dark walls with glowing orange lava stripes.
- The far end of the corridor shows a **rainbow portal / sky beam** (end-game area).

### Not seen yet (still useful)
- The **Shop** menu (main shop, via the green Shop button).
- The **Index** (collection book).
- A **guardian catching the player** (what happens: ragdoll? egg returns?).
- The **pen upgrade** result.

---

## Changes to DEVELOPMENT_PLAN.md implied by Part 2
1. **Active pet slots:** only equipped pets earn and appear in the pen. There's a buyable `+1 EQUIP` slot with rising cost, and an **Equip Best** button.
2. **Backpack/hotbar system:** eggs and unequipped pets are items that can be held in your hands. There's also a hit tool (bat).
3. **Pet weight (Kg)** replaces named size tiers. Income scales with weight.
4. **Fuse Machine:** 3 of the same species → 1 heavier pet (with a luck bonus).
5. **Sell Pets:** sort by weight/value, multi-select, total value.
6. **Trails = Speed multipliers** (x1.5 / x2 / x2.5 …), bought with money or premium currency.
7. **Steal = hold-to-interact** (about 1 s). Carrying hides the HUD and shows **RUN!!**, a red vignette and a **Drop** button.
8. **Incubation happens inside the pen.** The egg grows visually, with a Growing Eggs panel and a paid **Grow All**.
9. **Hatch → the pet goes to the backpack** and the Index badge increments. Add our own nicer reveal animation.
10. **Offline earnings banner**, a **potion event timer** alongside the night timer, and **rotating promo buttons**.
11. Mobile: circular jump button, camera-lock toggle, dynamic joystick, tap prompts.

## Answers from the user (Part 2 questions)
- **Guardian catches you:** hit sound, and the player is **ragdolled and flung some distance**.
  - If the egg drops **inside the guardian's own biome**, the guardian **picks it up, carries it back to its nest and places it**.
  - If the egg drops **outside that biome**, it just stays on the ground and the **guardian gives up and goes home**.
  - **Picking up a dropped egg again restarts the chase** (that biome's guardian comes after you).
- **Trails** boost **movement speed** (user's best understanding).
- **Potion timer:** unknown. We'll design our own (e.g. a free timed boost).
- **Bat:** yes, **hitting another player makes them drop their egg** (PvP stealing in the open world).
- **Growing-egg limit:** limited by **pet capacity**, which you increase with money (same pool as the "+1 EQUIP" slots).

---

## Part 3: Biomes (screenshots 31–36)

### Biome entry banner
- Entering a biome shows a **center-top banner**: a translucent dark horizontal strip with the **biome name in huge gradient text plus an emoji**.
  - **Jungle 😬**: purple/magenta text.
  - **Cosmic 👹**: white/pink text.
- It fades after a few seconds.

### Corridor structure
- Every biome is a **section of one long straight corridor**, about as wide as a football field, with **tall walls on both sides**. The wall top edge is colored per biome (green for grass, light blue for snow, dark for volcano).
- Biomes flow **directly into each other** with no doors. The floor and wall material simply switch at the boundary.
- A **tall white light beam / sky pillar** and a **rainbow ring portal** are visible at the far end from everywhere (long-distance landmark).

### Biome looks
| Biome | Floor | Walls | Props / details | Guardian seen |
|---|---|---|---|---|
| **Forest / hub** | bright green studs | brown checker, green top | bushes | — |
| **Desert** | sand/beige studs, lighter checker | yellow-tan checker | stepped sand pyramid, blocky cacti, red "recommended" signs | giant scorpion |
| **Jungle** | darker green studs | brown checker, green top | blocky palm trees, reeds, **blue studded pond** on one side | fiery-maned dino |
| **Snow** | white/light grey studs | brown checker, **light blue top** | **light-blue ice crystal clusters** | huge white furry beast |
| **Volcano** | dark grey studs | near-black checker with **glowing orange lava stripes** | lava staircases with flames, dead branches | fiery spiky creature |
| **Abyss Ocean** | dark | **blue walls** | pink/purple coral, bubbles | — |
| **Cosmic** | dark navy studs | black with white top edge | **starry night sky, neon ringed planet (pink/cyan), sparkles, white 4-point stars** on walls | — |
| **Cherry Blossom** | — | — | **red torii gate**, pink blossom trees, lanterns | — |

- **Each biome has its own skybox/lighting:** a bright day sky for most, and a **night starfield just for Cosmic**.

### Global announcements
- Chat and system messages broadcast rare spawns: **"A Secret Stag Egg spawned in Cherry Blossom 🌸!"** (egg name bold, biome name yellow). Our version: a server-wide toast plus a chat line when a Secret/Mythic egg spawns.

### Other players' bases (upgrade visuals)
- Pen **fence style changes with level**: a higher-level pen has **white fences with navy posts** instead of brown wood.
- The **treadmill looks different per level**: level 1 is **lavender/grey, "+2/step"**, while our level 3 is **white/cyan, "+12/step"**.
- Huge pets (a woolly mammoth taller than the walls, starry whale sharks) are visible from far away. Pet size gives bragging rights.
- A **house icon with "OFFLINE… CLAIM!" and an amount** floats at a base entrance. **Offline earnings are claimed by walking to a marker at your base**, not handed out automatically.
- Player list columns can switch order (Speed / Money/s), so it's probably sortable.

---

## Changes to DEVELOPMENT_PLAN.md implied by Part 3 and the answers
1. **Guardian catch:** ragdoll/knockback fling plus a hit sound. Egg drop logic:
   - Dropped **in its home biome** → the guardian carries it back to a nest.
   - Dropped **outside** → it stays as a pickup, and the guardian returns home.
   - Picking up a loose egg re-aggroes its home guardian.
2. **Bat PvP:** hitting a carrier knocks them and drops the egg (cooldown, no hitting inside the safe zone).
3. **Trails** multiply **movement speed**.
4. **Growing eggs** share the pet capacity limit.
5. **One continuous corridor world**, with biome regions defined by z-ranges. Floor, wall and sky swap per region, and a name banner shows on entry.
6. **Level-based visuals** for the pen fence and the treadmill. (Corrected in Part 4: **white = level 1, brown wood = upgraded**.)
7. **Offline claim marker** at the base.
8. **Rare-spawn global announcements.**

---

## Part 4: Shop, Index, pen upgrade (screenshots 37–38)

### Pen upgrade (user)
- The pen upgrade **only changes the fence color: white (level 1) → brown wood (upgraded)**. No other visible effect was found. This corrects the Part 3 note, which had the colors the wrong way round.
- Our version: pen level = fence material tier (white → wood → stone → gold …), a purely cosmetic status symbol. It can optionally give a small income bonus so the upgrade is worth buying.

### Shop (green Shop button)
- Modal with a **green striped header "Shop"** and red X, a dark studded body and a vertical scroll.
- **Category tabs outside the modal on the right**, as big icon-plus-label buttons: **Featured** (red % price tag), **Speed** (shoe), **Money** (cash stack).
- **"-- FEATURED --"** section title in yellow.
- **Limited-time egg banner** (fiery red/orange background):
  - A red **"New!"** tag, the egg name in huge yellow text (**"EXTINCTION EGG"**) and **"Limited Time!"**.
  - A **countdown** at the top-right (`12d 10h 16m 07s`).
  - A big egg render on the left.
  - A **row of pet cards showing drop odds** (39%, 24%, 18%, 11%, 6.5%, 0.5%, and a highlighted **1% "SKELETAL" variant with a rainbow border**).
  - **Bundle buy buttons** (premium currency): **1 Egg 99, 3 Eggs 249, 10 Eggs 799, 50 Eggs 3499** (with a struck-out "was 5,959"). Each has a **purple 🎁 gift button** to buy it for another player.
- So **eggs can also be bought directly** (premium eggs with their own pet pool), not only stolen.

### Pet Index (blue Index button)
- Modal with a **light-blue striped header "Pet Index"** and red X.
- Tabs outside on the right: **World 🌍** (biome pets) and **Limited** (event/shop pets).
- **Left strip:** a biome picture with its name (**"Forest"**). You scroll or page through biomes.
- **A grid of 8 pets per biome** (4×2). Each card has a **background colored by rarity**:
  - Discovered pets show their render and name.
  - **Undiscovered pets show a dark silhouette and "???"** on their rarity color.
- **Progress bar `4/8`** with a reward icon at the end (a **bat skin** for completing the biome).
- **Right detail panel:** the selected pet's render, **name, rarity, $/s**.
- **Rewards box:** each newly discovered pet gives a **claimable reward (`$100` money and `+420` Speed)** via a green **CLAIM!** button.
- **"CLAIM ALL (8)!"** wide blue button at the bottom. The **red badge on the Index button = number of unclaimed rewards**.

---

## Changes to DEVELOPMENT_PLAN.md implied by Part 4
1. **Shop with categories:** Featured (limited-time egg with drop odds, bundles, gifting), Speed boosts, Money packs, plus a premium currency (our own name, e.g. "Gems").
2. **Purchasable eggs** that go straight to incubation, with their own pet pools and a **limited-time event rotation** with a countdown.
3. **Pet Index:** per-biome grid of 8 pets, silhouettes for undiscovered ones, per-pet discovery rewards (money + Speed), a completion reward per biome (a cosmetic bat), Claim All, and a badge count on the HUD button. World and Limited tabs.
4. **8 pets per biome** as the content target (roughly 2 Common, 2 Uncommon, 1 Rare, 1 Epic, 1 Legendary, 1 Mythic, plus secret variants).
5. **Pen level = cosmetic fence tier.**

---

## Part 5: Abyss Ocean nests (screenshot 39)
- **Floor:** deep-blue studded floor with checker shading. **Walls:** blue checker.
- **Guardian:** a huge **blocky white shark** that **floats/swims in the air** above the floor, asleep ("Z").
- **Nests** are clustered in front of the guardian: brown twig rings holding **dark pyramid-shaped eggs** (black with white bands) and one small blue-grey egg. An **empty nest** means that egg has been stolen and is waiting to respawn.
- The previous biome (desert/prehistoric) is visible behind: sand, **fossil bones** and **skeleton props**.
- An orange **"recommended Speed" sign post** stands at the biome boundary.
