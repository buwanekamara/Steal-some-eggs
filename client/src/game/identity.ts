/**
 * Guest identity: a random id stored in this browser, used as the save-profile key.
 *
 * Testing tip: add `?profile=alice` to the URL to play as a separate test profile
 * (e.g. two tabs = two players). Without it, a second tab takes over the first.
 */
const KEY = "egg.guestId";

function randomId(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getProfileId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(KEY, id);
    }
  } catch {
    id = randomId(); // storage blocked: play with a throwaway profile
  }
  const suffix = new URLSearchParams(location.search).get("profile")?.replace(/[^\w-]/g, "").slice(0, 24);
  return suffix ? `${id}:${suffix}` : id;
}
