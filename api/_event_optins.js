// api/_event_optins.js
// Alliances' choices for server-wide events' reminders (owner, 2026-11-28). A server-wide
// event (or the Kingdom War battle) can let alliances opt in (`allow_optin`, on unless a
// Steward turns it off); each alliance's R4/R5 then choose, per event, whether its reminder
// is posted in their alert channel and who it pings (`optins`: { TAG: { on, ping, role_id } }).
// An alliance that opted in to every server event when it registered (server_event_alerts)
// counts as on until it chooses otherwise. Helpers, not an endpoint.

export const OPTIN_PINGS = ['role', 'custom_role', 'everyone', 'none'];

/** Whether alliances may opt in to this event's reminder (yes unless turned off). */
export const optinAllowed = (evt) => evt?.allow_optin !== false;

/**
 * One alliance's choice for an event: { on, ping, role_id, chosen }. `chosen`: the alliance
 * chose for this event (else it follows its registration's "every server event").
 */
export function optinFor(evt, tag, alliance) {
  const entries = evt?.optins && typeof evt.optins === 'object' ? evt.optins : {};
  // The tag exactly as the map keeps it: letter case tells alliances apart (RâvN, RÂVN)
  const entry = tag && Object.hasOwn(entries, tag) ? entries[tag] : null;
  if (!entry)
    return {
      on: Boolean(alliance?.server_event_alerts),
      ping: 'role',
      role_id: null,
      chosen: false,
    };
  return {
    on: entry.on === true,
    ping: OPTIN_PINGS.includes(entry.ping) ? entry.ping : 'role',
    role_id: entry.ping === 'custom_role' ? entry.role_id || null : null,
    chosen: true,
  };
}

/**
 * Who an alliance's post pings: a role ID, 'everyone', or null. An alliance's own choice
 * decides; one following its registration gets the event's own setting, as before (its
 * alert role, or @everyone without one).
 */
export function optinPing(evt, choice, alliance) {
  const alertRole = alliance?.alert_role_id || null;
  if (choice.chosen) {
    if (choice.ping === 'none') return null;
    if (choice.ping === 'everyone') return 'everyone';
    if (choice.ping === 'custom_role') return choice.role_id || alertRole || 'everyone';
    return alertRole || 'everyone';
  }
  if (evt.notify_target === 'none') return null;
  if (evt.notify_target === 'everyone') return 'everyone';
  return alertRole || 'everyone';
}
