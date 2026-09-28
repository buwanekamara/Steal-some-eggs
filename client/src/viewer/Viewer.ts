import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Anim } from "@egg/shared";
import { ModelLibrary, applyTransform, type ModelEntry } from "../assets/ModelLibrary.ts";
import { makePlaceholder } from "../assets/placeholders.ts";
import { ProceduralRig } from "../entities/Avatar.ts";

/**
 * Model Viewer (open the game with ?viewer).
 * Inspect every model id from the manifest, tweak scale/rotation/offset,
 * drop in new .glb/.fbx files, and save the manifest — no code changes needed.
 */
export async function startViewer(canvas: HTMLCanvasElement, ui: HTMLElement) {
  const lib = new ModelLibrary();
  await lib.loadManifest();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#9fd4ff");
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
  camera.position.set(5, 3.5, 7);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1, 0);
  controls.enableDamping = true;

  scene.add(new THREE.HemisphereLight("#ffffff", "#6a8f4a", 1.5));
  const sun = new THREE.DirectionalLight("#ffffff", 2.4);
  sun.position.set(6, 12, 8);
  sun.castShadow = true;
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: "#63d434" }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground, new THREE.GridHelper(60, 60, "#2e7d1f", "#4caf35"));

  // Reference: the 2-unit placeholder player, semi-transparent, standing to the left.
  const ref = makePlaceholder("player");
  ref.position.set(-2.2, 0, 0);
  ref.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m) {
      (o as THREE.Mesh).material = m.clone();
      ((o as THREE.Mesh).material as THREE.Material).transparent = true;
      ((o as THREE.Mesh).material as THREE.Material).opacity = 0.35;
    }
  });
  scene.add(ref);
  // +Z arrow: every model should face this way.
  scene.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.05, 0), 2.5, "#ff3b30", 0.4, 0.25));

  ui.insertAdjacentHTML(
    "beforeend",
    `<div class="viewer">
      <div class="panel v-list">
        <h3>Models</h3>
        <div class="v-ids"></div>
        <div class="v-new"><input placeholder="new id (e.g. egg_forest)"/><button>Add</button></div>
        <a class="v-back" href="/">← Back to game</a>
      </div>
      <div class="panel v-edit">
        <h3 class="v-title"></h3>
        <div class="v-status"></div>
        <label>File <select class="v-file"></select></label>
        <label>Scale <input class="v-scale" type="number" step="any"/></label>
        <div class="v-row"><button data-s="0.5">÷2</button><button data-s="0.9">−10%</button><button data-s="1.1">+10%</button><button data-s="2">×2</button><button class="v-fit">Fit to 2 units tall</button></div>
        <label>Rotation Y° <input class="v-rot" type="range" min="0" max="359" step="1"/> <span class="v-rot-val"></span></label>
        <div class="v-row"><button data-r="0">0°</button><button data-r="90">90°</button><button data-r="180">180°</button><button data-r="270">270°</button></div>
        <label>Offset Y <input class="v-off" type="number" step="0.05"/></label>
        <label>Texture <select class="v-tex"></select></label>
        <label class="v-check"><input class="v-auto" type="checkbox"/> Auto-color by bone (when no texture)</label>
        <label class="v-check"><input class="v-anim" type="checkbox" checked/> Play test run animation</label>
        <label>Note <input class="v-note"/></label>
        <div class="v-info"></div>
        <div class="v-row"><button class="v-save primary">💾 Save manifest</button><button class="v-copy">Copy JSON</button></div>
        <div class="v-drop">Drop a .glb / .gltf / .fbx (or .png texture) here to add it to <code>client/public/models</code></div>
        <div class="v-msg"></div>
      </div>
    </div>`,
  );
  const q = <T extends HTMLElement>(s: string) => ui.querySelector(s) as T;
  const idsEl = q<HTMLDivElement>(".v-ids");
  const fileSel = q<HTMLSelectElement>(".v-file");
  const texSel = q<HTMLSelectElement>(".v-tex");
  const scaleIn = q<HTMLInputElement>(".v-scale");
  const rotIn = q<HTMLInputElement>(".v-rot");
  const offIn = q<HTMLInputElement>(".v-off");
  const autoIn = q<HTMLInputElement>(".v-auto");
  const animIn = q<HTMLInputElement>(".v-anim");
  const noteIn = q<HTMLInputElement>(".v-note");
  const info = q<HTMLDivElement>(".v-info");
  const msg = q<HTMLDivElement>(".v-msg");

  let current = Object.keys(lib.manifest)[0] ?? "player";
  let holder: THREE.Group | null = null;
  let rig: ProceduralRig | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  let files: string[] = [];

  const say = (text: string, bad = false) => {
    msg.textContent = text;
    msg.style.color = bad ? "#ff6b6b" : "#7dff7d";
  };

  async function refreshFiles() {
    try {
      files = await (await fetch("/__dev/files")).json();
    } catch {
      files = [];
    }
  }

  function entry(): ModelEntry {
    return (lib.manifest[current] ??= { file: null, scale: 1, rotationY: 0, offsetY: 0 });
  }

  function renderList() {
    idsEl.innerHTML = Object.keys(lib.manifest)
      .map((id) => {
        const st = lib.status.get(id)?.source ?? "…";
        return `<button class="v-id${id === current ? " sel" : ""}" data-id="${id}"><span>${id}</span><em class="${st}">${st}</em></button>`;
      })
      .join("");
  }

  function renderForm() {
    const e = entry();
    q(".v-title").textContent = current;
    q(".v-status").textContent = lib.status.get(current)?.message ?? "";
    const models = files.filter((f) => /\.(glb|gltf|fbx)$/i.test(f));
    const images = files.filter((f) => /\.(png|jpe?g)$/i.test(f));
    fileSel.innerHTML = `<option value="">(placeholder)</option>` + models.map((f) => `<option${f === e.file ? " selected" : ""}>${f}</option>`).join("");
    texSel.innerHTML = `<option value="">(none / from model)</option>` + images.map((f) => `<option${f === e.texture ? " selected" : ""}>${f}</option>`).join("");
    scaleIn.value = String(e.scale);
    rotIn.value = String(e.rotationY ?? 0);
    q(".v-rot-val").textContent = `${e.rotationY ?? 0}°`;
    offIn.value = String(e.offsetY ?? 0);
    autoIn.checked = !!e.autoColor;
    noteIn.value = e.note ?? "";
  }

  function updateInfo() {
    if (!holder) return;
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder, true);
    const size = box.getSize(new THREE.Vector3());
    const lines = [
      `Size: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} units (player = 2 tall)`,
      `Bottom at y = ${box.min.y.toFixed(2)} (should be ≈ 0)`,
      rig ? `Rig: ${rig.ok ? rig.found.join(", ") : "no limbs found (static model)"}` : "",
      `Clips: ${holder.getObjectByName("model")?.children[0]?.animations?.map((c) => c.name).join(", ") || "none"}`,
    ];
    info.innerHTML = lines.filter(Boolean).join("<br/>");
  }

  function applyForm() {
    if (!holder) return;
    const inner = holder.getObjectByName("model")!;
    const fromFile = lib.status.get(current)?.source === "file";
    applyTransform(inner, fromFile ? entry() : { scale: 1, rotationY: 0, offsetY: 0 });
    updateInfo();
  }

  async function show(id: string, drop?: { buffer: ArrayBuffer; fileName: string }) {
    current = id;
    await lib.load(id, drop);
    if (holder) scene.remove(holder);
    holder = lib.instance(id);
    scene.add(holder);
    const character = holder.getObjectByName("model")!.children[0];
    rig = new ProceduralRig(character);
    mixer = null;
    const clips = character.animations ?? [];
    if (clips.length) {
      mixer = new THREE.AnimationMixer(character);
      mixer.clipAction(clips.find((c) => /run|walk/i.test(c.name)) ?? clips[0]).play();
    }
    renderList();
    renderForm();
    applyForm();
  }

  // ---- events
  idsEl.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button[data-id]") as HTMLButtonElement | null;
    if (b) show(b.dataset.id!);
  });
  q(".v-new button").addEventListener("click", () => {
    const input = q<HTMLInputElement>(".v-new input");
    const id = input.value.trim().replace(/[^\w-]/g, "");
    if (!id) return;
    lib.manifest[id] ??= { file: null, scale: 1, rotationY: 0, offsetY: 0 };
    input.value = "";
    show(id);
  });
  fileSel.addEventListener("change", () => {
    entry().file = fileSel.value || null;
    show(current);
  });
  texSel.addEventListener("change", () => {
    entry().texture = texSel.value || null;
    show(current);
  });
  scaleIn.addEventListener("input", () => {
    entry().scale = Number(scaleIn.value) || 1;
    applyForm();
  });
  rotIn.addEventListener("input", () => {
    entry().rotationY = Number(rotIn.value);
    q(".v-rot-val").textContent = `${rotIn.value}°`;
    applyForm();
  });
  offIn.addEventListener("input", () => {
    entry().offsetY = Number(offIn.value) || 0;
    applyForm();
  });
  autoIn.addEventListener("change", () => {
    entry().autoColor = autoIn.checked;
    show(current);
  });
  noteIn.addEventListener("input", () => (entry().note = noteIn.value));
  ui.querySelectorAll<HTMLButtonElement>("[data-s]").forEach((b) =>
    b.addEventListener("click", () => {
      entry().scale = +(entry().scale * Number(b.dataset.s)).toPrecision(4);
      renderForm();
      applyForm();
    }),
  );
  ui.querySelectorAll<HTMLButtonElement>("[data-r]").forEach((b) =>
    b.addEventListener("click", () => {
      entry().rotationY = Number(b.dataset.r);
      renderForm();
      applyForm();
    }),
  );
  q(".v-fit").addEventListener("click", () => {
    if (!holder) return;
    const inner = holder.getObjectByName("model")!;
    inner.scale.setScalar(1);
    holder.updateMatrixWorld(true);
    const h = new THREE.Box3().setFromObject(inner.children[0], true).getSize(new THREE.Vector3()).y || 1;
    entry().scale = +(2 / h).toPrecision(4);
    renderForm();
    applyForm();
  });
  q(".v-copy").addEventListener("click", async () => {
    await navigator.clipboard.writeText(JSON.stringify({ [current]: entry() }, null, 2));
    say("Copied entry JSON to clipboard.");
  });
  q(".v-save").addEventListener("click", async () => {
    const res = await fetch("/__dev/manifest", { method: "POST", body: JSON.stringify(lib.manifest) });
    say(res.ok ? "Saved client/public/models/manifest.json — refresh the game tab to see it." : `Save failed: ${await res.text()}`, !res.ok);
  });

  const drop = q<HTMLDivElement>(".v-drop");
  addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("over");
  });
  addEventListener("dragleave", () => drop.classList.remove("over"));
  addEventListener("drop", async (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    const res = await fetch(`/__dev/upload?name=${encodeURIComponent(file.name)}`, { method: "POST", body: file });
    if (!res.ok) return say(`Upload failed: ${await res.text()}`, true);
    await refreshFiles();
    if (/\.(png|jpe?g)$/i.test(file.name)) {
      entry().texture = file.name;
      say(`Uploaded ${file.name} and set it as the texture of "${current}". Save to keep it.`);
    } else {
      entry().file = file.name;
      say(`Uploaded ${file.name} and assigned it to "${current}". Adjust, then Save manifest.`);
    }
    show(current);
  });

  // ---- loop
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener("resize", resize);
  resize();

  await refreshFiles();
  await Promise.all(Object.keys(lib.manifest).map((id) => lib.load(id)));
  await show(current);

  const timer = new THREE.Timer();
  const tick = (now?: number) => {
    requestAnimationFrame(tick);
    timer.update(now);
    const dt = Math.min(0.05, timer.getDelta());
    if (animIn.checked) {
      if (mixer) mixer.update(dt);
      else rig?.update(dt, Anim.Run, 10);
    }
    controls.update();
    renderer.render(scene, camera);
  };
  tick();
}
