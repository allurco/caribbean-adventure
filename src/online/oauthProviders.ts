/** The providers a player may sign in with besides an email link (#106), in the order they are shown. */
export const OAUTH_PROVIDERS = ["discord", "google"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/** Each provider's name as the player reads it. */
export const OAUTH_PROVIDER_LABELS: Readonly<Record<OAuthProvider, string>> = { discord: "Discord", google: "Google" };
