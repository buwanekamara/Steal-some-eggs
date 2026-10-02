/**
 * Bloxity integration in one place: SDK setup, login, the portal's loading/gameplay lifecycle, and the player's
 * Bloxity character look.
 *
 * The SDK script in index.html exposes window.Legion.SDK and works the same whether the game is embedded in an
 * iframe on bloxity.io or hosted standalone. Everything here is a no-op when the script failed to load, so the game
 * still runs with its own character.
 *
 * Auth has exactly one onUserChanged subscription (in initBloxity); the rest of the game listens via onBloxityUser.
 * The user object is never cached: read it through currentUser() / the listener argument.
 */
import { LOOK_SLOTS, sanitizeLook, type BloxityLook } from "@egg/shared";
import type { LegionSDK, LegionUser } from "./legion-types.ts";

export type { LegionUser };

/** The slug this game is registered under on bloxity.io. */
export const BLOXITY_GAME_SLUG = (import.meta.env.VITE_BLOXITY_GAME_SLUG as string | undefined) || "steal-some-eggs";

let ready = false;
const userListeners = new Set<(user: LegionUser | null) => void>();
const lookListeners = new Set<() => void>();

/** The SDK once initialized, else null. */
export function sdk(): LegionSDK | null {
  return ready ? (window.Legion?.SDK ?? null) : null;
}

/** Runs an SDK call, logging instead of throwing (the portal must never be able to break the game). */
function safe<T>(what: string, fn: (s: LegionSDK) => T): T | undefined {
  const s = sdk();
  if (!s) return undefined;
  try {
    return fn(s);
  } catch (e) {
    console.warn(`[bloxity] ${what} failed`, e);
    return undefined;
  }
}

/** Call once on startup, before anything else here. Returns whether the SDK is available. */
export function initBloxity(): boolean {
  if (ready) return true;
  const s = window.Legion?.SDK;
  if (!s) {
    console.warn("[bloxity] SDK script not loaded: playing without Bloxity");
    return false;
  }
  try {
    s.init({ gameSlug: BLOXITY_GAME_SLUG });
  } catch (e) {
    console.warn("[bloxity] init failed", e);
    return false;
  }
  ready = true;
  console.info(`[bloxity] Legion.SDK.init ran (gameSlug "${BLOXITY_GAME_SLUG}", ${s.portal.isEmbeddedInLegion() ? "embedded" : "standalone"})`);
  // The single auth subscription: fires right away with the current state, then on every login/logout.
  s.auth.onUserChanged((user) => {
    console.info(`[bloxity] onUserChanged: ${user ? `${user.displayName || user.username} (@${user.username})` : "logged out"}`);
    for (const fn of userListeners) fn(user);
    for (const fn of lookListeners) fn(); // logging in/out swaps the avatar too
  });
  s.avatar.onAvatarChanged(() => lookListeners.forEach((fn) => fn()));
  s.avatar.onProportionsChanged(() => lookListeners.forEach((fn) => fn()));
  return true;
}

// ------------------------------------------------------------------ auth

/** Subscribes to login/logout; called immediately with the current user. Returns an unsubscribe function. */
export function onBloxityUser(fn: (user: LegionUser | null) => void): () => void {
  userListeners.add(fn);
  fn(currentUser());
  return () => userListeners.delete(fn);
}

export function currentUser(): LegionUser | null {
  return safe("getUser", (s) => s.auth.getUser()) ?? null;
}

export function displayName(user: LegionUser): string {
  return user.displayName || user.username;
}

/** "Log in" button: an in-game modal when embedded, a popup window when standalone. */
export async function login(): Promise<LegionUser | null> {
  const s = sdk();
  if (!s) return null;
  try {
    const user = await s.auth.showAuthPopup();
    console.info(`[bloxity] login flow returned ${user ? `user @${user.username}` : "no user"}`);
    return user;
  } catch (e) {
    console.warn("[bloxity] login failed", e);
    return null;
  }
}

export function logout() {
  safe("logout", (s) => s.auth.logout());
}

// ------------------------------------------------------------------ character

/**
 * This player's Bloxity character: equipped items + body proportions. Guests get the SDK's guest avatar,
 * so everyone plays as a Bloxity character whenever the SDK is available (null only without it).
 */
export function currentLook(): BloxityLook | null {
  return (
    safe("avatar", (s) => {
      const equipped = s.avatar.getEquipped() as Record<string, unknown>;
      const eq: Record<string, unknown> = {};
      for (const slot of LOOK_SLOTS) eq[slot] = equipped?.[slot];
      return sanitizeLook({ eq, props: s.avatar.getProportions() });
    }) ?? null
  );
}

/** Skin texture with the worn face/shirt/pants already drawn on (for this player's own avatar). */
export function localSkinTextureUrl(): string | null {
  return safe("getSkinTextureUrl", (s) => s.avatar.getSkinTextureUrl()) || null;
}

/** Fires whenever this player's look may have changed (items, proportions, login/logout). */
export function onLookChanged(fn: () => void): () => void {
  lookListeners.add(fn);
  return () => lookListeners.delete(fn);
}

/** Opens/closes Bloxity's avatar customizer. */
export function toggleCustomizer() {
  safe("toggleCustomizer", (s) => s.avatar.toggleCustomizer());
}

// ------------------------------------------------------------------ lifecycle

export const loadingStep = (text: string) => safe("loadingStep", (s) => s.game.loadingStep(text));
export const loadingEnd = () => safe("loadingEnd", (s) => s.game.loadingEnd());
export const gameplayStart = () => safe("gameplayStart", (s) => s.game.gameplayStart());
export const gameplayEnd = () => safe("gameplayEnd", (s) => s.game.gameplayEnd());
/** The joinable room id; "" while in menus. */
export const updateRoom = (roomId: string) => safe("updateRoom", (s) => s.game.updateRoom(roomId));
