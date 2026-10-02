// Types for the Bloxity SDK script (https://sdk.bloxity.io/legion-sdk.min.js), which exposes window.Legion.SDK.

export interface LegionUser {
  _id: string;
  username: string;
  displayName?: string;
  email?: string;
  pfp?: string;
  avatar?: unknown;
}

export interface LegionPresence {
  status: "online" | "in-game" | "away" | "offline";
  currentGame?: string;
  currentRoom?: string;
  currentParty?: string;
  gameSlug?: string;
  gameName?: string;
  lastSeen?: string;
}

export interface LegionFriend {
  _id: string;
  username: string;
  displayName?: string;
  pfp?: string;
  presence: LegionPresence;
}

export type LegionEquipped = Record<
  | "hatId"
  | "backId"
  | "skinId"
  | "headId"
  | "armLId"
  | "armRId"
  | "legLId"
  | "legRId"
  | "torsoId"
  | "hairId"
  | "maskId"
  | "neckId"
  | "chestId"
  | "waistId"
  | "handId"
  | "shoesId"
  | "faceId"
  | "pantsId"
  | "shirtId",
  string | null | undefined
>;

export interface LegionProportions {
  height: number;
  shoulderWidth: number;
  armLength: number;
  legOffsetX: number;
  torsoScaleX: number;
  neckHeight: number;
  headScale: number;
}

type Unsubscribe = () => void;

export interface LegionSDK {
  init(opts: { gameSlug: string; debug?: boolean }): void;
  auth: {
    getUser(): LegionUser | null;
    getToken(): string | null;
    isLoggedIn(): boolean;
    showAuthPopup(): Promise<LegionUser | null>;
    logout(): void;
    onUserChanged(cb: (user: LegionUser | null) => void): Unsubscribe;
    authenticateWithServer(url: string): Promise<unknown | null>;
  };
  avatar: {
    getEquipped(): LegionEquipped;
    getSkinTextureUrl(): string;
    getProportions(): LegionProportions;
    setProportions(p: Partial<LegionProportions>): Promise<void>;
    resetProportions(): Promise<void>;
    onAvatarChanged(cb: (equipped: LegionEquipped) => void): Unsubscribe;
    onProportionsChanged(cb: (p: LegionProportions) => void): Unsubscribe;
    showCustomizer(): void;
    hideCustomizer(): void;
    toggleCustomizer(): void;
    isCustomizerOpen(): boolean;
  };
  social: {
    getFriends(): Promise<LegionFriend[]>;
    inviteFriend(userId: string): Promise<boolean>;
    getInviteFriendsLink(opts?: { gameSlug?: string; roomId?: string; partyId?: string; baseUrl?: string; ref?: string }): string;
    sendFriendRequest(userId: string): Promise<{ success: boolean; status?: "accepted" | "pending"; error?: string }>;
  };
  settings: {
    listen(key: string, cb: (value: string) => void): Unsubscribe;
    get(key: string): string;
    getAll(): Record<string, string>;
    onChanged(cb: (key: string, value: string) => void): Unsubscribe;
    triggerAll(): void;
    refresh(): void;
  };
  game: {
    loadingStep(text: string): void;
    loadingEnd(): void;
    gameplayStart(): void;
    gameplayEnd(): void;
    updateRoom(roomId: string, partyId?: string): void;
    playerJoined(username: string): void;
    playerInRoom(username: string): void;
  };
  player: {
    onEvent(cb: (event: string, data?: unknown) => void): Unsubscribe;
  };
  bux: {
    requestPurchase(sku: string, metadata?: Record<string, unknown>): Promise<{ success: boolean; transactionId?: string; error?: string }>;
    getBalance(): Promise<number>;
  };
  portal: {
    isInIframe(): boolean;
    isEmbeddedInLegion(): boolean;
    requestFullscreen(): void;
    exitFullscreen(): void;
    showMenu(show: boolean): void;
  };
  api: {
    get<T = unknown>(path: string): Promise<T>;
    post<T = unknown>(path: string, body?: unknown): Promise<T>;
    patch<T = unknown>(path: string, body?: unknown): Promise<T>;
    delete<T = unknown>(path: string, body?: unknown): Promise<T>;
  };
}

declare global {
  interface Window {
    Legion?: { SDK: LegionSDK };
  }
}
