// api/_bot_schema.js
// The slash commands installed in registered alliance servers (/registerbot pushes them).
// Split out of api/interactions.js unchanged.

// --- DYNAMIC ALLIANCE COMMAND SCHEMA ---
// Synchronized with api/register-alliance.js; pushed to member servers via /registerbot
export const ALLIANCE_COMMANDS_SCHEMA = [
  {
    name: 'calendar',
    description: 'View or manage the Kingdom Event Calendar',
    type: 1,
    options: [
      {
        type: 3,
        name: 'action',
        description: 'Action to perform (leave blank to view calendar)',
        required: false,
        choices: [
          {
            name: 'Manage Alliance Events (R5 by default)',
            value: 'manage_alliance',
          },
          {
            name: 'Manage Global Events (Admin Only)',
            value: 'manage_global',
          },
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
