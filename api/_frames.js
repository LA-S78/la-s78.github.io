// api/_frames.js
// Which frame goes around a player's picture (owner, 2026-11-23): their alliance's avatar
// frame, when the alliance switched one on, in place of the game's default frame; with the
// leaders' "all" choice, in place of special frames too. Otherwise their own in-game frame.
// Used by the tracker's member pictures (api/_tracker.js) and the alliance images
// (api/_alliance_images.js, which keeps the alliances' settings).

/**
 * The game's default avatar frame (the plain one most players have: 144 of the 191 top
 * players on 2026-11-23). A player with it, or with none, has no special frame.
 */
export const DEFAULT_FRAMES = Object.freeze(['/game-art/frames/frame_5001.png']);
export const isDefaultFrame = (url) => !url || DEFAULT_FRAMES.includes(url);

/** `setting`: the alliance's { url, all }, or null when it has no frame switched on. */
export function frameFor(gameFrame, setting) {
  if (!setting) return gameFrame || null;
  return setting.all || isDefaultFrame(gameFrame) ? setting.url : gameFrame;
}
