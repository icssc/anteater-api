export const terms = ["Fall", "Winter", "Spring", "Summer1", "Summer10wk", "Summer2"] as const;
export type Term = (typeof terms)[number];
