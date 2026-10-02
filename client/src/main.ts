import "./style.css";
import { ModelLibrary } from "./assets/ModelLibrary.ts";
import * as bloxity from "./bloxity/bloxity.ts";
import { Game, serverUrl } from "./game/Game.ts";

const canvas = document.getElementById("scene") as HTMLCanvasElement;
const ui = document.getElementById("ui") as HTMLElement;
const params = new URLSearchParams(location.search);

/** Models start loading right away (the Bloxity portal shows the steps on its loading screen). */
let libLoad: { lib: ModelLibrary; done: Promise<void>; progress: number } | null = null;

if (params.has("viewer")) {
  document.title = "Egg Heist — Model Viewer";
  import("./viewer/Viewer.ts").then((m) => m.startViewer(canvas, ui));
} else {
  bloxity.initBloxity(); // once, before anything else uses the SDK
  showStartScreen();
}

function loadModels() {
  if (libLoad) return libLoad;
  const lib = new ModelLibrary();
  let lastStep = -1;
  bloxity.loadingStep("Loading models…");
  const state = {
    lib,
    progress: 0,
    done: lib
      .loadAll((done, total) => {
        state.progress = done / total;
        const bar = ui.querySelector<HTMLElement>(".start .bar");
        if (bar) bar.style.width = `${state.progress * 100}%`;
        const pct = Math.floor(state.progress * 10) * 10;
        if (pct !== lastStep) bloxity.loadingStep(`Loading models… ${(lastStep = pct)}%`);
      })
      .then(() => void bloxity.loadingEnd())
      .catch((e) => {
        libLoad = null; // retry on the next Play
        bloxity.loadingEnd();
        throw e;
      }),
  };
  libLoad = state;
  return state;
}

function showStartScreen() {
  const saved = safeGet("egg.name") ?? "";
  ui.innerHTML = `
    <div class="start">
      <h1>Egg Heist</h1>
      <p class="sub">Guardians of the Wild</p>
      <input class="name" maxlength="16" placeholder="Your name" value="${saved.replace(/"/g, "")}" />
      <div class="bx-login"></div>
      <button class="play big-btn shop">Play</button>
      <div class="progress"><div class="bar"></div></div>
      <div class="err"></div>
      ${import.meta.env.DEV ? `<a class="viewer-link" href="?viewer">Open Model Viewer</a>` : ""}
    </div>`;
  const nameIn = ui.querySelector(".name") as HTMLInputElement;
  const playBtn = ui.querySelector(".play") as HTMLButtonElement;
  const bar = ui.querySelector(".bar") as HTMLDivElement;
  const loginRow = ui.querySelector(".bx-login") as HTMLDivElement;
  const models = loadModels();
  bar.style.width = `${models.progress * 100}%`;

  // Logged in with Bloxity: play under your Bloxity name. Otherwise: type a name, or log in.
  const offUser = bloxity.onBloxityUser((user) => {
    if (!bloxity.sdk()) return;
    if (user) {
      nameIn.value = bloxity.displayName(user).slice(0, 16);
      nameIn.disabled = true;
      loginRow.innerHTML = `<span>Logged in as <b></b></span><button data-bx="logout">Log out</button>`;
      (loginRow.querySelector("b") as HTMLElement).textContent = `@${user.username}`;
    } else {
      nameIn.disabled = false;
      nameIn.value = safeGet("egg.name") ?? "";
      loginRow.innerHTML = `<button data-bx="login">Log in with Bloxity</button>`;
    }
  });
  loginRow.addEventListener("click", async (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>("[data-bx]")?.dataset.bx;
    if (act === "login") await bloxity.login();
    else if (act === "logout") bloxity.logout();
  });

  const go = async () => {
    playBtn.disabled = true;
    const name = nameIn.value.trim();
    if (!bloxity.currentUser()) safeSet("egg.name", name);
    try {
      const { lib, done } = loadModels();
      await done;
      offUser();
      ui.innerHTML = "";
      const game = new Game(canvas, ui, lib);
      await game.connect(name);
    } catch (e) {
      console.error(e);
      if (!ui.querySelector(".start")) showStartScreen();
      (ui.querySelector(".err") as HTMLElement).textContent =
        import.meta.env.DEV
          ? `Could not connect to the game server at ${serverUrl()}. Is "npm run dev" running? (${(e as Error).message ?? e})`
          : "Couldn't reach the game server. Please try again in a moment.";
      (ui.querySelector(".play") as HTMLButtonElement).disabled = false;
    }
  };
  playBtn.addEventListener("click", go);
  nameIn.addEventListener("keydown", (e) => e.key === "Enter" && go());
  nameIn.focus();
  // ?autoplay&name=Tester skips this screen (handy for opening many test tabs).
  if (params.has("autoplay")) {
    if (params.get("name")) nameIn.value = params.get("name")!;
    go();
  }
}

function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
}
