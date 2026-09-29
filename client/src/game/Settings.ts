/** Player settings (graphics quality, sound), kept in this browser. */

export type GraphicsChoice = "auto" | "high" | "low";
export type Quality = "high" | "low";

export interface Settings {
  graphics: GraphicsChoice;
  sound: boolean;
}

/** What each quality level means. Low is for phones and weak laptops. */
export const QUALITY: Record<
  Quality,
  {
    /** Render resolution cap (× CSS pixels). */
    pixelRatioMax: number;
    shadows: boolean;
    /** Where the fog fully hides things; eggs and guardians beyond `viewDistance` aren't drawn at all. */
    fogFar: number;
    viewDistance: number;
    /** Pet name tags and "+$" popups only within this distance. */
    detailDistance: number;
    /** Max "+$" income popups per second. */
    popupBudget: number;
  }
> = {
  high: { pixelRatioMax: 2, shadows: true, fogFar: 1100, viewDistance: 1150, detailDistance: 70, popupBudget: 24 },
  low: { pixelRatioMax: 1, shadows: false, fogFar: 520, viewDistance: 560, detailDistance: 40, popupBudget: 8 },
};

const KEY = "egg.settings";
const DEFAULTS: Settings = { graphics: "auto", sound: true };

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>;
    return {
      graphics: raw.graphics === "high" || raw.graphics === "low" ? raw.graphics : "auto",
      sound: raw.sound !== false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}

/** "Auto" picks Low on touch devices (phones/tablets), High elsewhere. */
export function resolveQuality(s: Settings, isTouch: boolean): Quality {
  return s.graphics === "auto" ? (isTouch ? "low" : "high") : s.graphics;
}
