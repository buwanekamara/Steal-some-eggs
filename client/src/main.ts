import "./style.css";
import { ModelLibrary } from "./assets/ModelLibrary.ts";
import { Game, serverUrl } from "./game/Game.ts";

const canvas = document.getElementById("scene") as HTMLCanvasElement;
const ui = document.getElementById("ui") as HTMLElement;
const params = new URLSearchParams(location.search);

if (params.has("viewer")) {
  document.title = "Egg Heist — Model Viewer";
  import("./viewer/Viewer.ts").then((m) => m.startViewer(canvas, ui));
} else {
  showStartScreen();
}

function showStartScreen() {
  const saved = safeGet("egg.name") ?? "";
  ui.innerHTML = `
    <div class="start">
      <h1>Egg Heist</h1>
      <p class="sub">Guardians of the Wild</p>
      <input class="name" maxlength="16" placeholder="Your name" value="${saved.replace(/"/g, "")}" />
      <button class="play big-btn shop">Play</button>
      <div class="progress"><div class="bar"></div></div>
      <div class="err"></div>
      ${import.meta.env.DEV ? `<a class="viewer-link" href="?viewer">Open Model Viewer</a>` : ""}
    </div>`;
  const nameIn = ui.querySelector(".name") as HTMLInputElement;
  const playBtn = ui.querySelector(".play") as HTMLButtonElement;
  const bar = ui.querySelector(".bar") as HTMLDivElement;

  const go = async () => {
    playBtn.disabled = true;
    const name = nameIn.value.trim();
    safeSet("egg.name", name);
    try {
      const lib = new ModelLibrary();
      await lib.loadAll((done, total) => (bar.style.width = `${(done / total) * 100}%`));
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
