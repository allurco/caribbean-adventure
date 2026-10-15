/** The browser tests' captains (#113): access token, user id and name. Fixed, and good for nothing outside the e2e server. */
export const E2E_PLAYERS = {
  anne: { token: "e2e-token-anne", id: "00000000-0000-4000-8000-0000000000a1", name: "Anne Bonny" },
  jack: { token: "e2e-token-jack", id: "00000000-0000-4000-8000-0000000000b2", name: "Calico Jack" },
} as const;

/** Where the client's Supabase settings point in the browser tests: the e2e server, under a path of its own. */
export const E2E_SUPABASE_PATH = "/e2e-supabase";
