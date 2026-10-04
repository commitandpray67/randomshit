/**
 * Who gets which chat pet. Edit this by hand; the sprites themselves are made
 * with `npm run sprites -- <sheet> <set>/<name>` (see app/chatpets/sprites/walk).
 *
 * Everything is keyed by Twitch login: lower case, as in twitch.tv/<login>.
 */

/** The set a streamer's chat gets when they aren't listed below. */
export const DEFAULT_SET = "cats";

/**
 * Each streamer's set, by their channel. A streamer who isn't listed gets
 * DEFAULT_SET, and so does one whose set doesn't exist (yet).
 *
 * Juntella is meant to get a set of their own: make the sprites as
 * `juntella/<name>`, then add `juntella: "juntella"` here.
 */
export const STREAMER_SETS: Record<string, string> = {
  nayomy_cs: "cats",
  qiyarah: "cats",
};

/**
 * Chatters who always get one particular sprite, in every streamer's chat,
 * whatever that streamer's set is. Sprites in the `special` set go to nobody
 * else.
 */
export const CHATTER_SPRITES: Record<string, string> = {
  skipperlovesnate: "special/whale",
};
