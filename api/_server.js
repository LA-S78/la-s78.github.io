// api/_server.js
// Which game and server this site is for (owner request, 2026-11-22): the one place it's set,
// so nothing else in the code says "78". Today one site serves Last Asylum server 78; a site
// for another server would set GAME_SERVER in Vercel (the other per-server pieces, its Gist,
// Blob folder and Discord settings, are listed in docs/ALLIANCE-IDS-PLAN.md, "Other servers").
//
// GAME_SERVER: the server's number in the game (digits only; anything else is ignored).

export const GAME = 'lastasylum';

const asked = String(process.env.GAME_SERVER || '').trim();
/** The server, as text (as the alliance register keeps it): '78'. */
export const SERVER = /^\d{1,6}$/.test(asked) ? asked : '78';
/** The same as a number, as the Last Asylum Tracker's addresses take it. */
export const SERVER_NUMBER = Number(SERVER);
