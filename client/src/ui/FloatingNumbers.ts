import { formatShort } from "@egg/shared";

const MAX_LIVE = 14;

/**
 * Reference-style gain popups: a blue "+N 👟" pops out near the player,
 * then flies into the HUD counter, which pulses when it lands.
 */
export class FloatingNumbers {
  private live = 0;

  constructor(private root: HTMLElement) {}

  /** Spawns a popup at screen position (x, y) that flies into `target`. */
  gain(amount: number, x: number, y: number, target: HTMLElement, kind: "speed" | "money" = "speed") {
    if (this.live >= MAX_LIVE || amount <= 0) return;
    this.live++;
    const el = document.createElement("div");
    el.className = `float-gain ${kind}`;
    el.innerHTML = `<span>+${kind === "money" ? "$" : ""}${formatShort(amount)}</span><i>${kind === "money" ? "💵" : "👟"}</i>`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.root.appendChild(el);

    const t = target.getBoundingClientRect();
    const ox = (Math.random() - 0.5) * 160;
    const oy = -40 - Math.random() * 80;
    const tx = t.left + t.width / 2 - x;
    const ty = t.top + t.height / 2 - y;
    const anim = el.animate(
      [
        { transform: "translate(-50%, -50%) scale(0.4)", opacity: 0 },
        { transform: `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px)) scale(1.15)`, opacity: 1, offset: 0.22 },
        { transform: `translate(calc(-50% + ${ox}px), calc(-50% + ${oy - 12}px)) scale(1)`, opacity: 1, offset: 0.5 },
        { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0.35)`, opacity: 0.2 },
      ],
      { duration: 1150, easing: "cubic-bezier(.3,.7,.4,1)" },
    );
    anim.onfinish = () => {
      el.remove();
      this.live--;
      target.classList.remove("pulse");
      void target.offsetWidth; // restart the CSS animation
      target.classList.add("pulse");
    };
  }
}
