// api/_bot_schema.js
// The slash commands installed in registered alliance servers (/registerbot pushes them).
// Split out of api/interactions.js unchanged.

import { localizeCommands } from './_command_text.js';
import { SERVER_DATA } from './_generated_translations.js';

// --- DYNAMIC ALLIANCE COMMAND SCHEMA ---
// Synchronized with api/register-alliance.js; pushed to member servers via /registerbot.
// The English is here; translations for the command picker are added below.
const ALLIANCE_COMMANDS = [
  {
    name: 'calendar',
    description: "See the Capitol and today's events",
    type: 1,
    options: [
      {
        type: 3,
        name: 'view',
        description: 'What to show (blank: the Capitol card)',
        required: false,
        choices: [
          { name: "👑 Capitol: holder, daily reset and what's next", value: 'capitol' },
          { name: "🛡️ Alliance: your alliance's events today", value: 'alliance' },
          { name: '🏰 Kingdom: server-wide events today', value: 'kingdom' },
        ],
      },
      {
        type: 3,
        name: 'share',
        description: 'Who sees the reply (blank: only you)',
        required: false,
        choices: [
          { name: '🔒 Only me', value: 'private' },
          { name: '📢 Everyone in this channel', value: 'public' },
        ],
      },
    ],
  },
  {
    name: 'suggest',
    description: 'Submit a rule proposal, report an alliance issue, or check your ticket status',
    type: 1,
    options: [
      {
        type: 3,
        name: 'type',
        description: 'Select ticket category or check your active submissions',
        required: true,
        choices: [
          {
            name: '👑 Kingdom / NAP Proposal (Server-Wide Rule or Event Idea)',
            value: 'nap_proposal',
          },
          {
            name: '🛡️ Internal Alliance Issue (Handled Privately by Your R4/R5s)',
            value: 'alliance_issue',
          },
          {
            name: '📋 View My Ticket Status (Active & Recent History)',
            value: 'status',
          },
        ],
      },
    ],
  },
  {
    name: 'nominate',
    description: 'Request an authenticated portal link to submit weekly chest nominations',
    type: 1,
    // Optional, so plain /nominate works as before (owner request, 2026-11-27)
    options: [
      {
        type: 3,
        name: 'show',
        description: 'Leave blank for the nomination link',
        required: false,
        choices: [
          { name: '🔗 Get the nomination link', value: 'link' },
          { name: '📋 Show our current list', value: 'list' },
        ],
      },
      {
        type: 3,
        name: 'alliance',
        description: 'Stewards: act for another alliance (a test link when rewards are closed)',
        required: false,
      },
    ],
  },
  // /caravan (owner request, 2026-11-27): api/_bot_caravan.js
  {
    name: 'caravan',
    description: "Your alliance's Caravan Rotor: see it, or pick a player (leaders)",
    type: 1,
    options: [
      {
        type: 3,
        name: 'action',
        description: 'Leave blank to see the rotor',
        required: false,
        choices: [
          {
            name: '👀 Show the rotor',
            value: 'show',
          },
          {
            name: '✅ Pick a player',
            value: 'pick',
          },
          {
            name: '↩️ Undo a pick',
            value: 'unpick',
          },
        ],
      },
      {
        type: 3,
        name: 'player',
        description: "The player's in-game name (for pick or undo)",
        required: false,
      },
      {
        type: 3,
        name: 'alliance',
        description: "Stewards: another alliance's tag",
        required: false,
      },
    ],
  },
  {
    name: 'rewards',
    description: "This week's rewards: status, and the Kingdom War result (Stewards)",
    type: 1,
    options: [
      {
        type: 3,
        name: 'action',
        description: "Leave blank to see this week's reward status",
        required: false,
        choices: [
          { name: 'Record Kingdom War: Won (Steward)', value: 'won' },
          { name: 'Record Kingdom War: Lost (Steward)', value: 'lost' },
          { name: "Clear this week's nominations (Steward)", value: 'reset' },
          { name: 'Reset Capitol overrides and buyouts (Steward)', value: 'reset_overrides' },
        ],
      },
    ],
  },
  {
    name: 'sb',
    description: 'Display the Survival Battle arms race schedule and active events',
    type: 1,
    options: [
      {
        type: 4,
        name: 'day',
        description: 'Day of the cycle (1-7)',
        required: false,
        min_value: 1,
        max_value: 7,
      },
    ],
  },
  {
    name: 'rules',
    description: 'Display server and Kingdom NAP rules',
    type: 1,
    options: [
      {
        type: 4,
        name: 'rule',
        description: 'Specific rule number to view',
        required: false,
        min_value: 1,
      },
    ],
  },
  {
    name: 'map',
    description: 'View live Last Asylum territory map',
    type: 1,
  },
];

/**
 * The commands as sent to Discord, with the picker's translations (_data/<lang>/server.yml,
 * bot_commands). Alliance servers get new translations when they register, or when a
 * Steward runs /registerbot action: Sync All Registered Servers.
 */
export const ALLIANCE_COMMANDS_SCHEMA = localizeCommands(ALLIANCE_COMMANDS, SERVER_DATA);
