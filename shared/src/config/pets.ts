// Pets, hatching, mutations, pen capacity and income. All balance numbers live here.

import { EGGS, EGG_BY_ID, type Rarity } from "./eggs.ts";

export interface PetDef {
  id: string;
  name: string;
  biome: string;
  rarity: Rarity;
  /** $/s at the base weight with no mutation. */
  baseIncome: number;
  /** Typical weight in Kg (income and size scale with weight). */
  baseWeight: number;
  /** Height in units of the placeholder model at base weight. */
  height: number;
  /** Colors for the placeholder model: body, accent. */
  colors: [string, string];
  /** Emoji for menus until real icons exist. */
  icon: string;
  /** Body plan for the placeholder model. */
  shape: "bird" | "quad" | "biped";
  /** Model id in manifest.json (defaults to `pet_<id>`). */
  model?: string;
}

export const PETS: PetDef[] = [
  { id: "forest_chick", name: "Chick", biome: "forest", rarity: "Common", baseIncome: 1, baseWeight: 2, height: 1.8, colors: ["#ffe066", "#ff9f1c"], icon: "🐤", shape: "bird" },
  { id: "forest_bunny", name: "Bunny", biome: "forest", rarity: "Common", baseIncome: 2, baseWeight: 1.5, height: 2.0, colors: ["#f2f2f2", "#ffb3c7"], icon: "🐰", shape: "quad" },
  { id: "forest_piglet", name: "Piglet", biome: "forest", rarity: "Uncommon", baseIncome: 6, baseWeight: 5, height: 2.4, colors: ["#ff9ec4", "#e0608f"], icon: "🐷", shape: "quad" },
  { id: "forest_fox", name: "Fox", biome: "forest", rarity: "Uncommon", baseIncome: 12, baseWeight: 6, height: 2.8, colors: ["#f07b2a", "#ffffff"], icon: "🦊", shape: "quad" },
  { id: "forest_owl", name: "Burrowing Owl", biome: "forest", rarity: "Rare", baseIncome: 40, baseWeight: 3, height: 3.0, colors: ["#8a5a33", "#f2d49b"], icon: "🦉", shape: "bird" },
  { id: "forest_bear", name: "Bear", biome: "forest", rarity: "Epic", baseIncome: 250, baseWeight: 40, height: 4.8, colors: ["#7a4a24", "#c49a6c"], icon: "🐻", shape: "biped" },
  { id: "forest_stag", name: "Stag", biome: "forest", rarity: "Legendary", baseIncome: 900, baseWeight: 30, height: 5.2, colors: ["#a86a3a", "#f4e3c8"], icon: "🦌", shape: "quad" },
  { id: "forest_spirit", name: "Forest Spirit", biome: "forest", rarity: "Mythic", baseIncome: 5000, baseWeight: 8, height: 4.5, colors: ["#7dffb0", "#ffffff"], icon: "🧚", shape: "biped" },
  { id: "lake_duckling", name: "Duckling", biome: "lake", rarity: "Common", baseIncome: 1, baseWeight: 1.4, height: 1.6, colors: ["#fff1a8", "#f2b705"], icon: "🦆", shape: "bird" },
  { id: "lake_otter", name: "Otter", biome: "lake", rarity: "Common", baseIncome: 2, baseWeight: 4, height: 1.8, colors: ["#6b4a34", "#c9a67a"], icon: "🦦", shape: "quad" },
  { id: "lake_turtle", name: "Turtle", biome: "lake", rarity: "Uncommon", baseIncome: 6, baseWeight: 9, height: 1.4, colors: ["#3f8a4a", "#d9c27a"], icon: "🐢", shape: "quad" },
  { id: "lake_frog", name: "Frog", biome: "lake", rarity: "Uncommon", baseIncome: 12, baseWeight: 2.5, height: 1.3, colors: ["#5fbf4a", "#dff2a0"], icon: "🐸", shape: "quad" },
  { id: "lake_heron", name: "Heron", biome: "lake", rarity: "Rare", baseIncome: 40, baseWeight: 5, height: 3.2, colors: ["#b7c4cf", "#5c6b73"], icon: "🐦", shape: "bird" },
  { id: "lake_beaver", name: "Beaver", biome: "lake", rarity: "Epic", baseIncome: 250, baseWeight: 22, height: 2.2, colors: ["#6a4a2c", "#3a2a18"], icon: "🦫", shape: "quad" },
  { id: "lake_swan", name: "Swan", biome: "lake", rarity: "Legendary", baseIncome: 900, baseWeight: 11, height: 3.4, colors: ["#ffffff", "#ff7a1a"], icon: "🦢", shape: "bird" },
  { id: "lake_leviathan", name: "Lake Leviathan", biome: "lake", rarity: "Mythic", baseIncome: 5000, baseWeight: 60, height: 5.0, colors: ["#1d6f6f", "#0d3b3b"], icon: "🐉", shape: "quad" },
  { id: "desert_scorpling", name: "Scorpling", biome: "desert", rarity: "Common", baseIncome: 1, baseWeight: 1.5, height: 1.2, colors: ["#c9974a", "#6b4423"], icon: "🦂", shape: "quad" },
  { id: "desert_sandlizard", name: "Sand Lizard", biome: "desert", rarity: "Common", baseIncome: 2, baseWeight: 1, height: 1.0, colors: ["#b8cf7a", "#7a9a4a"], icon: "🦎", shape: "quad" },
  { id: "desert_roadrunner", name: "Roadrunner", biome: "desert", rarity: "Uncommon", baseIncome: 6, baseWeight: 3, height: 1.8, colors: ["#8a6a4a", "#e0c060"], icon: "🦤", shape: "bird" },
  { id: "desert_camel", name: "Camel", biome: "desert", rarity: "Uncommon", baseIncome: 12, baseWeight: 90, height: 3.4, colors: ["#d9b26a", "#a67c3a"], icon: "🐪", shape: "quad" },
  { id: "desert_fennec", name: "Fennec Fox", biome: "desert", rarity: "Rare", baseIncome: 40, baseWeight: 4, height: 2.2, colors: ["#f2d9a8", "#c9a05a"], icon: "🦊", shape: "quad" },
  { id: "desert_vulture", name: "Vulture", biome: "desert", rarity: "Epic", baseIncome: 250, baseWeight: 14, height: 3.6, colors: ["#6b5a4a", "#c9a227"], icon: "🦅", shape: "bird" },
  { id: "desert_sandwyrm", name: "Sand Wyrm", biome: "desert", rarity: "Legendary", baseIncome: 900, baseWeight: 35, height: 4.4, colors: ["#d4a017", "#8a6a1a"], icon: "🐍", shape: "quad" },
  { id: "desert_goldscarab", name: "Golden Scarab", biome: "desert", rarity: "Mythic", baseIncome: 5000, baseWeight: 20, height: 3.0, colors: ["#1a1a1a", "#ffd700"], icon: "🪲", shape: "quad" },
  { id: "jungle_parrot", name: "Parrot", biome: "jungle", rarity: "Common", baseIncome: 1, baseWeight: 1, height: 1.4, colors: ["#3adf6a", "#ff5a3a"], icon: "🦜", shape: "bird" },
  { id: "jungle_monkey", name: "Monkey", biome: "jungle", rarity: "Common", baseIncome: 2, baseWeight: 2.5, height: 1.8, colors: ["#8a6a4a", "#e0c9a0"], icon: "🐒", shape: "quad" },
  { id: "jungle_sloth", name: "Sloth", biome: "jungle", rarity: "Uncommon", baseIncome: 6, baseWeight: 5, height: 1.6, colors: ["#a8926a", "#7a6a4a"], icon: "🦥", shape: "quad" },
  { id: "jungle_gorilla", name: "Gorilla", biome: "jungle", rarity: "Uncommon", baseIncome: 12, baseWeight: 60, height: 3.2, colors: ["#2a2a2a", "#4a4a4a"], icon: "🦍", shape: "biped" },
  { id: "jungle_jaguarcub", name: "Jaguar Cub", biome: "jungle", rarity: "Rare", baseIncome: 40, baseWeight: 18, height: 2.4, colors: ["#e0a83a", "#1a1a1a"], icon: "🐆", shape: "quad" },
  { id: "jungle_anaconda", name: "Anaconda", biome: "jungle", rarity: "Epic", baseIncome: 250, baseWeight: 12, height: 1.2, colors: ["#3a5a2a", "#1a2a14"], icon: "🐍", shape: "quad" },
  { id: "jungle_orangutan", name: "Orangutan", biome: "jungle", rarity: "Legendary", baseIncome: 900, baseWeight: 70, height: 3.6, colors: ["#c9662a", "#8a441a"], icon: "🦧", shape: "biped" },
  { id: "jungle_emeraldtiger", name: "Emerald Tiger", biome: "jungle", rarity: "Mythic", baseIncome: 5000, baseWeight: 40, height: 3.0, colors: ["#0fae6a", "#0a1a12"], icon: "🐯", shape: "quad" },
  { id: "snow_bunny", name: "Snow Bunny", biome: "snow", rarity: "Common", baseIncome: 1, baseWeight: 1.3, height: 1.6, colors: ["#ffffff", "#cfe8ff"], icon: "🐇", shape: "quad" },
  { id: "snow_penguin", name: "Penguin", biome: "snow", rarity: "Common", baseIncome: 2, baseWeight: 2, height: 1.4, colors: ["#1a2a3a", "#ffffff"], icon: "🐧", shape: "bird" },
  { id: "snow_arcticfox", name: "Arctic Fox", biome: "snow", rarity: "Uncommon", baseIncome: 6, baseWeight: 4, height: 2.0, colors: ["#ffffff", "#9fc9e0"], icon: "🦊", shape: "quad" },
  { id: "snow_owl", name: "Snowy Owl", biome: "snow", rarity: "Uncommon", baseIncome: 12, baseWeight: 3.5, height: 2.6, colors: ["#eef6ff", "#9fbfdf"], icon: "🦉", shape: "bird" },
  { id: "snow_reindeer", name: "Reindeer", biome: "snow", rarity: "Rare", baseIncome: 40, baseWeight: 28, height: 3.2, colors: ["#8a6a4a", "#e8d9c0"], icon: "🦌", shape: "quad" },
  { id: "snow_polarbear", name: "Polar Bear", biome: "snow", rarity: "Epic", baseIncome: 250, baseWeight: 85, height: 4.4, colors: ["#f2f8ff", "#cfe0f0"], icon: "🐻‍❄️", shape: "biped" },
  { id: "snow_icewyvern", name: "Ice Wyvern", biome: "snow", rarity: "Legendary", baseIncome: 900, baseWeight: 38, height: 4.8, colors: ["#7fd9ff", "#2a6f9a"], icon: "🐲", shape: "quad" },
  { id: "snow_glaciertitan", name: "Glacier Titan", biome: "snow", rarity: "Mythic", baseIncome: 5000, baseWeight: 50, height: 5.0, colors: ["#bfefff", "#2a9adf"], icon: "🧊", shape: "biped" },
  { id: "volcano_lavanewt", name: "Lava Newt", biome: "volcano", rarity: "Common", baseIncome: 1, baseWeight: 1.4, height: 1.2, colors: ["#ff8a3a", "#8a2a0a"], icon: "🦎", shape: "quad" },
  { id: "volcano_ashrat", name: "Ash Rat", biome: "volcano", rarity: "Common", baseIncome: 2, baseWeight: 1.8, height: 1.2, colors: ["#4a4a4a", "#2a2a2a"], icon: "🐀", shape: "quad" },
  { id: "volcano_emberfox", name: "Ember Fox", biome: "volcano", rarity: "Uncommon", baseIncome: 6, baseWeight: 4.5, height: 2.0, colors: ["#ff6a2a", "#3a1a0a"], icon: "🦊", shape: "quad" },
  { id: "volcano_magmaturtle", name: "Magma Turtle", biome: "volcano", rarity: "Uncommon", baseIncome: 12, baseWeight: 10, height: 1.6, colors: ["#8a2a0a", "#2a1005"], icon: "🐢", shape: "quad" },
  { id: "volcano_firehawk", name: "Fire Hawk", biome: "volcano", rarity: "Rare", baseIncome: 40, baseWeight: 6, height: 3.0, colors: ["#ff3a1a", "#ffb02a"], icon: "🦅", shape: "bird" },
  { id: "volcano_obsidianwolf", name: "Obsidian Wolf", biome: "volcano", rarity: "Epic", baseIncome: 250, baseWeight: 30, height: 3.6, colors: ["#1a1a1a", "#3a2a2a"], icon: "🐺", shape: "quad" },
  { id: "volcano_phoenix", name: "Phoenix", biome: "volcano", rarity: "Legendary", baseIncome: 900, baseWeight: 15, height: 3.8, colors: ["#ff7a1a", "#ffd24a"], icon: "🔥", shape: "bird" },
  { id: "volcano_infernotitan", name: "Inferno Titan", biome: "volcano", rarity: "Mythic", baseIncome: 5000, baseWeight: 55, height: 5.0, colors: ["#2a1005", "#ff5a1a"], icon: "🌋", shape: "biped" },
  { id: "abyss_crab", name: "Crab", biome: "abyss", rarity: "Common", baseIncome: 1, baseWeight: 1.5, height: 1.0, colors: ["#ff6a5a", "#a83a2a"], icon: "🦀", shape: "quad" },
  { id: "abyss_jellyfish", name: "Jellyfish", biome: "abyss", rarity: "Common", baseIncome: 2, baseWeight: 1, height: 1.4, colors: ["#c9a2ff", "#6a2ae0"], icon: "🪼", shape: "bird" },
  { id: "abyss_reeffish", name: "Reef Fish", biome: "abyss", rarity: "Uncommon", baseIncome: 6, baseWeight: 2, height: 1.0, colors: ["#3adfff", "#1a7aae"], icon: "🐠", shape: "quad" },
  { id: "abyss_octopus", name: "Octopus", biome: "abyss", rarity: "Uncommon", baseIncome: 12, baseWeight: 8, height: 1.6, colors: ["#8a3a8a", "#4a1a4a"], icon: "🐙", shape: "quad" },
  { id: "abyss_anglerfish", name: "Anglerfish", biome: "abyss", rarity: "Rare", baseIncome: 40, baseWeight: 5, height: 1.4, colors: ["#1a1a3a", "#3a6a9a"], icon: "🐡", shape: "quad" },
  { id: "abyss_hammerhead", name: "Hammerhead", biome: "abyss", rarity: "Epic", baseIncome: 250, baseWeight: 40, height: 3.0, colors: ["#5a7a8a", "#2a4a5a"], icon: "🦈", shape: "quad" },
  { id: "abyss_eelking", name: "Eel King", biome: "abyss", rarity: "Legendary", baseIncome: 900, baseWeight: 10, height: 1.2, colors: ["#0a2a3a", "#3a8a9a"], icon: "🐍", shape: "quad" },
  { id: "abyss_krakenspawn", name: "Kraken Spawn", biome: "abyss", rarity: "Mythic", baseIncome: 5000, baseWeight: 65, height: 4.2, colors: ["#0a1a3a", "#5affd0"], icon: "🌊", shape: "quad" },
  { id: "prehistoric_compy", name: "Compy", biome: "prehistoric", rarity: "Common", baseIncome: 1, baseWeight: 1.6, height: 1.4, colors: ["#8fae52", "#4f6e2a"], icon: "🦕", shape: "quad" },
  { id: "prehistoric_babyraptor", name: "Baby Raptor", biome: "prehistoric", rarity: "Common", baseIncome: 2, baseWeight: 2, height: 1.6, colors: ["#6b8a3a", "#3a5a1a"], icon: "🦖", shape: "quad" },
  { id: "prehistoric_ankylosaurus", name: "Ankylosaurus", biome: "prehistoric", rarity: "Uncommon", baseIncome: 6, baseWeight: 12, height: 2.2, colors: ["#8a7a5a", "#4a3a2a"], icon: "🐢", shape: "quad" },
  { id: "prehistoric_gallimimus", name: "Gallimimus", biome: "prehistoric", rarity: "Uncommon", baseIncome: 12, baseWeight: 8, height: 2.6, colors: ["#c9a05a", "#8a6a3a"], icon: "🦤", shape: "bird" },
  { id: "prehistoric_sabertooth", name: "Sabertooth", biome: "prehistoric", rarity: "Rare", baseIncome: 40, baseWeight: 25, height: 2.8, colors: ["#e0c9a0", "#8a6a4a"], icon: "🐅", shape: "quad" },
  { id: "prehistoric_mammoth", name: "Woolly Mammoth", biome: "prehistoric", rarity: "Epic", baseIncome: 250, baseWeight: 90, height: 4.8, colors: ["#8a6a4a", "#5a4a3a"], icon: "🐘", shape: "quad" },
  { id: "prehistoric_trex", name: "Tyrannosaurus", biome: "prehistoric", rarity: "Legendary", baseIncome: 900, baseWeight: 60, height: 4.6, colors: ["#4a5a3a", "#2a3a1a"], icon: "🦖", shape: "biped" },
  { id: "prehistoric_skeletaltitan", name: "Skeletal Titan", biome: "prehistoric", rarity: "Mythic", baseIncome: 5000, baseWeight: 48, height: 5.0, colors: ["#e8e2d0", "#9a9280"], icon: "🦴", shape: "biped" },
  { id: "cosmic_moonpup", name: "Moon Pup", biome: "cosmic", rarity: "Common", baseIncome: 1, baseWeight: 1.4, height: 1.6, colors: ["#c9d9ff", "#5a5a8a"], icon: "🐺", shape: "quad" },
  { id: "cosmic_starkit", name: "Star Kit", biome: "cosmic", rarity: "Common", baseIncome: 2, baseWeight: 1.6, height: 1.4, colors: ["#ffffff", "#c9a2ff"], icon: "🐱", shape: "quad" },
  { id: "cosmic_voidbat", name: "Void Bat", biome: "cosmic", rarity: "Uncommon", baseIncome: 6, baseWeight: 2, height: 1.8, colors: ["#3a1a5a", "#8a4dff"], icon: "🦇", shape: "bird" },
  { id: "cosmic_nebulamoth", name: "Nebula Moth", biome: "cosmic", rarity: "Uncommon", baseIncome: 12, baseWeight: 1.8, height: 1.6, colors: ["#c94dff", "#5a1a8a"], icon: "🦋", shape: "bird" },
  { id: "cosmic_astrofox", name: "Astro Fox", biome: "cosmic", rarity: "Rare", baseIncome: 40, baseWeight: 4.5, height: 2.4, colors: ["#5a7aff", "#1a2a6a"], icon: "🦊", shape: "quad" },
  { id: "cosmic_galaxyserpent", name: "Galaxy Serpent", biome: "cosmic", rarity: "Epic", baseIncome: 250, baseWeight: 15, height: 1.2, colors: ["#2a0a4a", "#c94dff"], icon: "🐍", shape: "quad" },
  { id: "cosmic_voidreaper", name: "Void Reaper", biome: "cosmic", rarity: "Legendary", baseIncome: 900, baseWeight: 30, height: 3.8, colors: ["#1a0a2a", "#8a4dff"], icon: "👹", shape: "biped" },
  { id: "cosmic_cosmicdragon", name: "Cosmic Dragon", biome: "cosmic", rarity: "Mythic", baseIncome: 5000, baseWeight: 45, height: 5.0, colors: ["#2a0a4a", "#ffd24a"], icon: "🐉", shape: "quad" },
  { id: "cherry_petalsprite", name: "Petal Sprite", biome: "cherry", rarity: "Common", baseIncome: 1, baseWeight: 1.2, height: 1.4, colors: ["#ffd9e6", "#ff9ec4"], icon: "🧚", shape: "bird" },
  { id: "cherry_koifish", name: "Koi Fish", biome: "cherry", rarity: "Common", baseIncome: 2, baseWeight: 1.5, height: 1.2, colors: ["#ff7a5a", "#ffffff"], icon: "🐟", shape: "quad" },
  { id: "cherry_redpanda", name: "Red Panda", biome: "cherry", rarity: "Uncommon", baseIncome: 6, baseWeight: 5, height: 1.8, colors: ["#c9662a", "#f2f2f2"], icon: "🐼", shape: "quad" },
  { id: "cherry_crane", name: "Crane", biome: "cherry", rarity: "Uncommon", baseIncome: 12, baseWeight: 4, height: 2.6, colors: ["#ffffff", "#ff5a3a"], icon: "🕊️", shape: "bird" },
  { id: "cherry_tanuki", name: "Tanuki", biome: "cherry", rarity: "Rare", baseIncome: 40, baseWeight: 6, height: 2.2, colors: ["#8a6a4a", "#e0c9a0"], icon: "🦝", shape: "quad" },
  { id: "cherry_blossomdeer", name: "Blossom Deer", biome: "cherry", rarity: "Epic", baseIncome: 250, baseWeight: 28, height: 3.8, colors: ["#ffb3d1", "#8a4a5a"], icon: "🦌", shape: "quad" },
  { id: "cherry_sakuradragon", name: "Sakura Dragon", biome: "cherry", rarity: "Legendary", baseIncome: 900, baseWeight: 35, height: 4.6, colors: ["#ff9ec4", "#ffd24a"], icon: "🐉", shape: "quad" },
  { id: "cherry_blossomphoenix", name: "Blossom Phoenix", biome: "cherry", rarity: "Mythic", baseIncome: 5000, baseWeight: 20, height: 5.0, colors: ["#ff5a8a", "#ffd24a"], icon: "🔥", shape: "bird" },
  { id: "titan_pebblegolem", name: "Pebble Golem", biome: "titan", rarity: "Common", baseIncome: 1, baseWeight: 3, height: 1.6, colors: ["#9aa0ab", "#4a4f5a"], icon: "🪨", shape: "quad" },
  { id: "titan_stoneowl", name: "Stone Owl", biome: "titan", rarity: "Common", baseIncome: 2, baseWeight: 3.5, height: 2.0, colors: ["#7a808a", "#4a4f5a"], icon: "🦉", shape: "bird" },
  { id: "titan_runewolf", name: "Rune Wolf", biome: "titan", rarity: "Uncommon", baseIncome: 6, baseWeight: 8, height: 2.6, colors: ["#5a70b0", "#2a3a6a"], icon: "🐺", shape: "quad" },
  { id: "titan_moaisprite", name: "Moai Sprite", biome: "titan", rarity: "Uncommon", baseIncome: 12, baseWeight: 6, height: 2.0, colors: ["#8a8478", "#5a564a"], icon: "🗿", shape: "quad" },
  { id: "titan_bronzehawk", name: "Bronze Hawk", biome: "titan", rarity: "Rare", baseIncome: 40, baseWeight: 6, height: 3.0, colors: ["#c9a227", "#6a5a10"], icon: "🦅", shape: "bird" },
  { id: "titan_titanbull", name: "Titan Bull", biome: "titan", rarity: "Epic", baseIncome: 250, baseWeight: 95, height: 4.4, colors: ["#6a5a4a", "#3a2a1a"], icon: "🐂", shape: "quad" },
  { id: "titan_colossus", name: "Colossus", biome: "titan", rarity: "Legendary", baseIncome: 900, baseWeight: 60, height: 5.0, colors: ["#9aa0ab", "#5a70b0"], icon: "🏛️", shape: "biped" },
  { id: "titan_titanking", name: "Titan King", biome: "titan", rarity: "Mythic", baseIncome: 5000, baseWeight: 55, height: 5.4, colors: ["#ffc21f", "#8a6a10"], icon: "👑", shape: "biped" },
  { id: "celestial_cherub", name: "Cherub", biome: "celestial", rarity: "Common", baseIncome: 1, baseWeight: 1.5, height: 1.6, colors: ["#ffffff", "#ffd966"], icon: "👼", shape: "biped" },
  { id: "celestial_stardove", name: "Star Dove", biome: "celestial", rarity: "Common", baseIncome: 2, baseWeight: 1, height: 1.4, colors: ["#f2f5ff", "#d8c68e"], icon: "🕊️", shape: "bird" },
  { id: "celestial_riftfox", name: "Rift Fox", biome: "celestial", rarity: "Uncommon", baseIncome: 6, baseWeight: 4, height: 2.2, colors: ["#c9a2ff", "#6a2ae0"], icon: "🦊", shape: "quad" },
  { id: "celestial_cometdeer", name: "Comet Deer", biome: "celestial", rarity: "Uncommon", baseIncome: 12, baseWeight: 26, height: 3.0, colors: ["#c9d9ff", "#5a7aff"], icon: "🦌", shape: "quad" },
  { id: "celestial_guardianangel", name: "Guardian Angel", biome: "celestial", rarity: "Rare", baseIncome: 40, baseWeight: 5, height: 2.8, colors: ["#ffffff", "#ffd966"], icon: "🧚", shape: "bird" },
  { id: "celestial_seraphhound", name: "Seraph Hound", biome: "celestial", rarity: "Epic", baseIncome: 250, baseWeight: 22, height: 3.6, colors: ["#ffe08a", "#ffffff"], icon: "🐕", shape: "quad" },
  { id: "celestial_archangel", name: "Archangel", biome: "celestial", rarity: "Legendary", baseIncome: 900, baseWeight: 32, height: 4.8, colors: ["#ffffff", "#ffd966"], icon: "😇", shape: "biped" },
  { id: "celestial_dragonking", name: "Celestial Dragon King", biome: "celestial", rarity: "Mythic", baseIncome: 5000, baseWeight: 50, height: 5.6, colors: ["#ffffff", "#ffe08a"], icon: "🐉", shape: "quad" },
  // Limited pets: only from the Featured shop egg.
  { id: "limited_goldhen", name: "Golden Hen", biome: "limited", rarity: "Rare", baseIncome: 60, baseWeight: 4, height: 2.6, colors: ["#ffcf3a", "#ff7a1a"], icon: "🐔", shape: "bird" },
  { id: "limited_luckycat", name: "Lucky Cat", biome: "limited", rarity: "Epic", baseIncome: 400, baseWeight: 6, height: 2.6, colors: ["#fff6e6", "#ff3b3b"], icon: "🐱", shape: "quad" },
  { id: "limited_crystaldeer", name: "Crystal Deer", biome: "limited", rarity: "Legendary", baseIncome: 1_500, baseWeight: 25, height: 4.6, colors: ["#9ff3ff", "#ffffff"], icon: "🦌", shape: "quad" },
  { id: "limited_nuggetking", name: "Nugget King", biome: "limited", rarity: "Mythic", baseIncome: 8_000, baseWeight: 30, height: 5, colors: ["#ffc21f", "#8a6a10"], icon: "👑", shape: "biped" },
];

export const PET_BY_ID = new Map(PETS.map((p) => [p.id, p]));

export function petModelId(def: PetDef) {
  return def.model ?? `pet_${def.id}`;
}

// ---------------------------------------------------------------- hatching

export interface HatchInfo {
  /** Seconds to grow in the pen before it can hatch. */
  growSec: number;
  /** [petId, weight] — what this egg can hatch into. */
  pets: [string, number][];
}

export const HATCH: Record<string, HatchInfo> = {
  forest_speckled: {
    growSec: 30,
    pets: [["forest_chick", 45], ["forest_bunny", 35], ["forest_piglet", 12], ["forest_fox", 6], ["forest_owl", 2]],
  },
  forest_mossy: {
    growSec: 60,
    pets: [["forest_bunny", 25], ["forest_piglet", 30], ["forest_fox", 28], ["forest_owl", 12], ["forest_bear", 5]],
  },
  forest_acorn: {
    growSec: 120,
    pets: [["forest_fox", 30], ["forest_owl", 35], ["forest_bear", 25], ["forest_stag", 9], ["forest_spirit", 1]],
  },
  lake_pebble: {
    growSec: 35,
    pets: [["lake_duckling", 45], ["lake_otter", 35], ["lake_turtle", 12], ["lake_frog", 6], ["lake_heron", 2]],
  },
  lake_reed: {
    growSec: 70,
    pets: [["lake_otter", 25], ["lake_turtle", 30], ["lake_frog", 28], ["lake_heron", 12], ["lake_beaver", 5]],
  },
  lake_pearl: {
    growSec: 140,
    pets: [["lake_frog", 30], ["lake_heron", 35], ["lake_beaver", 25], ["lake_swan", 9], ["lake_leviathan", 1]],
  },
  desert_sand: {
    growSec: 40,
    pets: [["desert_scorpling", 45], ["desert_sandlizard", 35], ["desert_roadrunner", 12], ["desert_camel", 6], ["desert_fennec", 2]],
  },
  desert_cactus: {
    growSec: 80,
    pets: [["desert_sandlizard", 25], ["desert_roadrunner", 30], ["desert_camel", 28], ["desert_fennec", 12], ["desert_vulture", 5]],
  },
  desert_scarab: {
    growSec: 160,
    pets: [["desert_camel", 30], ["desert_fennec", 35], ["desert_vulture", 25], ["desert_sandwyrm", 9], ["desert_goldscarab", 1]],
  },
  jungle_vine: {
    growSec: 45,
    pets: [["jungle_parrot", 45], ["jungle_monkey", 35], ["jungle_sloth", 12], ["jungle_gorilla", 6], ["jungle_jaguarcub", 2]],
  },
  jungle_bamboo: {
    growSec: 90,
    pets: [["jungle_monkey", 25], ["jungle_sloth", 30], ["jungle_gorilla", 28], ["jungle_jaguarcub", 12], ["jungle_anaconda", 5]],
  },
  jungle_orchid: {
    growSec: 180,
    pets: [["jungle_gorilla", 30], ["jungle_jaguarcub", 35], ["jungle_anaconda", 25], ["jungle_orangutan", 9], ["jungle_emeraldtiger", 1]],
  },
  snow_frost: {
    growSec: 50,
    pets: [["snow_bunny", 45], ["snow_penguin", 35], ["snow_arcticfox", 12], ["snow_owl", 6], ["snow_reindeer", 2]],
  },
  snow_icicle: {
    growSec: 100,
    pets: [["snow_penguin", 25], ["snow_arcticfox", 30], ["snow_owl", 28], ["snow_reindeer", 12], ["snow_polarbear", 5]],
  },
  snow_aurora: {
    growSec: 200,
    pets: [["snow_arcticfox", 30], ["snow_reindeer", 35], ["snow_polarbear", 25], ["snow_icewyvern", 9], ["snow_glaciertitan", 1]],
  },
  volcano_ember: {
    growSec: 55,
    pets: [["volcano_lavanewt", 45], ["volcano_ashrat", 35], ["volcano_emberfox", 12], ["volcano_magmaturtle", 6], ["volcano_firehawk", 2]],
  },
  volcano_obsidian: {
    growSec: 110,
    pets: [["volcano_ashrat", 25], ["volcano_emberfox", 30], ["volcano_magmaturtle", 28], ["volcano_firehawk", 12], ["volcano_obsidianwolf", 5]],
  },
  volcano_molten: {
    growSec: 220,
    pets: [["volcano_magmaturtle", 30], ["volcano_firehawk", 35], ["volcano_obsidianwolf", 25], ["volcano_phoenix", 9], ["volcano_infernotitan", 1]],
  },
  abyss_barnacle: {
    growSec: 60,
    pets: [["abyss_crab", 45], ["abyss_jellyfish", 35], ["abyss_reeffish", 12], ["abyss_octopus", 6], ["abyss_anglerfish", 2]],
  },
  abyss_coral: {
    growSec: 120,
    pets: [["abyss_jellyfish", 25], ["abyss_reeffish", 30], ["abyss_octopus", 28], ["abyss_anglerfish", 12], ["abyss_hammerhead", 5]],
  },
  abyss_abyssal: {
    growSec: 240,
    pets: [["abyss_octopus", 30], ["abyss_anglerfish", 35], ["abyss_hammerhead", 25], ["abyss_eelking", 9], ["abyss_krakenspawn", 1]],
  },
  prehistoric_fossil: {
    growSec: 65,
    pets: [["prehistoric_compy", 45], ["prehistoric_babyraptor", 35], ["prehistoric_ankylosaurus", 12], ["prehistoric_gallimimus", 6], ["prehistoric_sabertooth", 2]],
  },
  prehistoric_amber: {
    growSec: 130,
    pets: [["prehistoric_babyraptor", 25], ["prehistoric_ankylosaurus", 30], ["prehistoric_gallimimus", 28], ["prehistoric_sabertooth", 12], ["prehistoric_mammoth", 5]],
  },
  prehistoric_raptor: {
    growSec: 260,
    pets: [["prehistoric_gallimimus", 30], ["prehistoric_sabertooth", 35], ["prehistoric_mammoth", 25], ["prehistoric_trex", 9], ["prehistoric_skeletaltitan", 1]],
  },
  cosmic_comet: {
    growSec: 70,
    pets: [["cosmic_moonpup", 45], ["cosmic_starkit", 35], ["cosmic_voidbat", 12], ["cosmic_nebulamoth", 6], ["cosmic_astrofox", 2]],
  },
  cosmic_nebula: {
    growSec: 140,
    pets: [["cosmic_starkit", 25], ["cosmic_voidbat", 30], ["cosmic_nebulamoth", 28], ["cosmic_astrofox", 12], ["cosmic_galaxyserpent", 5]],
  },
  cosmic_starlight: {
    growSec: 280,
    pets: [["cosmic_voidbat", 30], ["cosmic_astrofox", 35], ["cosmic_galaxyserpent", 25], ["cosmic_voidreaper", 9], ["cosmic_cosmicdragon", 1]],
  },
  cherry_petal: {
    growSec: 75,
    pets: [["cherry_petalsprite", 45], ["cherry_koifish", 35], ["cherry_redpanda", 12], ["cherry_crane", 6], ["cherry_tanuki", 2]],
  },
  cherry_sakura: {
    growSec: 150,
    pets: [["cherry_koifish", 25], ["cherry_redpanda", 30], ["cherry_crane", 28], ["cherry_tanuki", 12], ["cherry_blossomdeer", 5]],
  },
  cherry_koi: {
    growSec: 300,
    pets: [["cherry_redpanda", 30], ["cherry_tanuki", 35], ["cherry_blossomdeer", 25], ["cherry_sakuradragon", 9], ["cherry_blossomphoenix", 1]],
  },
  titan_rubble: {
    growSec: 80,
    pets: [["titan_pebblegolem", 45], ["titan_stoneowl", 35], ["titan_runewolf", 12], ["titan_moaisprite", 6], ["titan_bronzehawk", 2]],
  },
  titan_rune: {
    growSec: 160,
    pets: [["titan_stoneowl", 25], ["titan_runewolf", 30], ["titan_moaisprite", 28], ["titan_bronzehawk", 12], ["titan_titanbull", 5]],
  },
  titan_idol: {
    growSec: 320,
    pets: [["titan_runewolf", 30], ["titan_bronzehawk", 35], ["titan_titanbull", 25], ["titan_colossus", 9], ["titan_titanking", 1]],
  },
  celestial_halo: {
    growSec: 85,
    pets: [["celestial_cherub", 45], ["celestial_stardove", 35], ["celestial_riftfox", 12], ["celestial_cometdeer", 6], ["celestial_guardianangel", 2]],
  },
  celestial_rift: {
    growSec: 170,
    pets: [["celestial_stardove", 25], ["celestial_riftfox", 30], ["celestial_cometdeer", 28], ["celestial_guardianangel", 12], ["celestial_seraphhound", 5]],
  },
  celestial_divine: {
    growSec: 340,
    pets: [["celestial_riftfox", 30], ["celestial_guardianangel", 35], ["celestial_seraphhound", 25], ["celestial_archangel", 9], ["celestial_dragonking", 1]],
  },
  limited_nugget: {
    growSec: 60,
    pets: [["forest_owl", 30], ["limited_goldhen", 35], ["limited_luckycat", 24], ["limited_crystaldeer", 10], ["limited_nuggetking", 1]],
  },
};

/** Drop odds of an egg as percentages (for the Shop's Featured banner). */
export function hatchOdds(eggDefId: string): { petId: string; pct: number }[] {
  const pool = HATCH[eggDefId]?.pets ?? [];
  const total = pool.reduce((a, [, w]) => a + w, 0);
  return pool.map(([petId, w]) => ({ petId, pct: +((w / total) * 100).toFixed(2) }));
}

/** Growing eggs get physically bigger: scale multiplier when ready. */
export const GROW_SCALE = 2.2;

// ---------------------------------------------------------------- mutations

export interface MutationDef {
  id: string;
  /** Name prefix ("Golden Fox"); empty for normal pets. */
  prefix: string;
  chance: number;
  incomeMult: number;
  /** Tint over the pet's colors ("" = none). */
  color: string;
  /** Material look for the placeholder. */
  metallic: boolean;
}

/** Checked rarest first; whatever doesn't roll a mutation is Normal. */
export const MUTATIONS: MutationDef[] = [
  { id: "rainbow", prefix: "Rainbow", chance: 0.005, incomeMult: 5, color: "#ff5ec8", metallic: false },
  { id: "golden", prefix: "Golden", chance: 0.03, incomeMult: 2, color: "#ffc21f", metallic: true },
];

export const MUTATION_BY_ID = new Map(MUTATIONS.map((m) => [m.id, m]));

// ---------------------------------------------------------------- pen capacity

export const PEN = {
  /** Slots a new player starts with (active pets + growing eggs share them). */
  startSlots: 4,
  maxSlots: 20,
  /** Eggs can't be planted closer than this to each other. */
  eggSpacing: 3,
  /** Pets and eggs stay this far inside the fence. */
  inset: 1.8,
} as const;

/** Extra pet slots each pen upgrade adds on top of the ones you bought. */
export const PEN_LEVEL_SLOTS = 2;

/** Pet slots in use for `bought` slots (start + shop + rewards) at a pen level. */
export function penSlotsTotal(bought: number, penLevel: number): number {
  return bought + Math.max(0, penLevel - 1) * PEN_LEVEL_SLOTS;
}

/** Money cost of the next slot when you own `slots` slots. */
export function slotCost(slots: number): number {
  const k = slots - PEN.startSlots;
  return Math.round(500 * 5 ** k);
}

// ---------------------------------------------------------------- rolls and income

function weighted<T>(items: [T, number][], rnd: number): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let r = rnd * total;
  for (const [item, w] of items) if ((r -= w) < 0) return item;
  return items[items.length - 1][0];
}

export function rollPet(eggDefId: string, rnd: number): PetDef {
  return PET_BY_ID.get(weighted(HATCH[eggDefId].pets, rnd))!;
}

export function rollMutation(rnd: number): MutationDef | null {
  let acc = 0;
  for (const m of MUTATIONS) if (rnd < (acc += m.chance)) return m;
  return null;
}

/** Weight in Kg: bigger eggs give heavier pets, with ±20% randomness. */
export function rollWeight(pet: PetDef, eggSize: number, rnd: number): number {
  return +(pet.baseWeight * eggSize * (0.8 + rnd * 0.45)).toFixed(1);
}

export function petIncome(pet: PetDef, weight: number, mutation: string): number {
  const mult = mutation ? (MUTATION_BY_ID.get(mutation)?.incomeMult ?? 1) : 1;
  return Math.max(1, Math.round(pet.baseIncome * (weight / pet.baseWeight) * mult));
}

/** Model scale for a pet of this weight (volume grows with weight, so size grows with its cube root). */
export function petScale(pet: PetDef, weight: number): number {
  return Math.cbrt(weight / pet.baseWeight);
}

export function petDisplayName(pet: PetDef, mutation: string): string {
  const m = mutation ? MUTATION_BY_ID.get(mutation) : undefined;
  return m ? `${m.prefix} ${pet.name}` : pet.name;
}

// ---------------------------------------------------------------- species eggs (Fusion Machine output)

/** Id of the egg that hatches only this species (made by fusing three of it). */
export function fusedEggId(species: string): string {
  return `fused_${species}`;
}

/**
 * One egg per species. They are registered for every egg lookup (EGG_BY_ID, HATCH) but deliberately left out
 * of EGGS, so they never spawn in nests. They grow like the slowest egg of their biome.
 */
for (const pet of PETS) {
  const id = fusedEggId(pet.id);
  const biomeEggs = EGGS.filter((e) => e.biome === pet.biome);
  EGG_BY_ID.set(id, { id, name: `${pet.name} Egg`, biome: pet.biome, rarity: pet.rarity, weight: 0, colors: pet.colors });
  HATCH[id] = { growSec: Math.max(30, ...biomeEggs.map((e) => HATCH[e.id]?.growSec ?? 30)), pets: [[pet.id, 1]] };
}
