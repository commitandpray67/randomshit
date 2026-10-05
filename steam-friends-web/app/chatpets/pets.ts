/**
 * NOT where chat pets are set up any more: that's the studio (chat pets →
 * Custom pets…), and the studio's database.
 *
 * This is who had which pet when they were built into the app. The database
 * is filled from it, and from the sprites in app/chatpets/sprites/walk, once,
 * the first time the new version runs (lib/petsprites.ts, seedBuiltIns), and
 * neither is read again after that. Changing this file changes nothing on a
 * server that has already done that.
 *
 * Everything is keyed by Twitch login: lower case, as in twitch.tv/<login>.
 */

/** The set a streamer's chat gets when they aren't listed below. */
export const DEFAULT_SET = "cats";

/**
 * Each streamer's set, by their channel. A streamer who isn't listed gets
 * DEFAULT_SET, and so does one whose set doesn't exist (yet).
 */
export const STREAMER_SETS: Record<string, string> = {
  juntella: "juntella",
  nayomy_cs: "cats",
  qiyarah: "cats",
};

/**
 * Chatters who always get one particular sprite, in every streamer's chat,
 * whatever that streamer's set is. Sprites in the `special` set go to nobody
 * else.
 */
export const CHATTER_SPRITES: Record<string, string> = {
  litmusq: "special/british",
  siqaa666: "special/french",
  skipperbtw: "special/whale",
  unemployedvera: "special/vera",
};
