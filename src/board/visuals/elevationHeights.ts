/**
 * World height that each land elevation rises to (1 beach, 2 jungle, 3
 * mountain). In its own module so the massif layout (#83) can read it
 * without importing the field that imports the layout.
 */
export const ELEVATION_HEIGHTS = { 1: 0.3, 2: 0.75, 3: 1.4 } as const;
