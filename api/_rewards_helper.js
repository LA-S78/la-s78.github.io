// api/_rewards_helper.js
// Centralized Quota & Safe Reset Helper

import { advanceCycleState } from "./_cycle_helper.js";

/**
 * Calculates the exact chest nomination quota for an alliance for the active week.
 * Automatically intercepts active Wartime Buyout installments and WLO deductions.
 */
export function getAllianceNominationQuota(allianceTag, rewardsState = {}, mapState = {}) {
  const cleanTag = String(allianceTag || "").trim();
  const currentWeek = rewardsState.cycle_state?.current_week ?? 1;
  const isKW = rewardsState.mode === "kw" || (currentWeek >= 1 && currentWeek <= 3);

  // 1. Determine Alliance Rank from map-state
  const allianceInfo = mapState.alliances?.[cleanTag];
  const rank = allianceInfo?.rank !== undefined && allianceInfo?.rank !== null
    ? parseInt(allianceInfo.rank, 10)
    : 99;

  // 2. Base Quota from distribution_tiers
  let baseQuota = {
    commanders_will_reg: 0,
    commanders_will_kw: 0,
    loyal_servant: 0,
    followers_heart: 0,
  };

  const tiers = rewardsState.distribution_tiers || [];
  const tier = tiers.find((t) => {
    const min = parseInt(t.min_rank ?? t.minRank, 10);
    const max = parseInt(t.max_rank ?? t.maxRank, 10);
    return !isNaN(min) && !isNaN(max) && rank >= min && rank <= max;
  });

  if (tier) {
    const rawGold = Number(tier.chests?.commanders_will || 0);
    baseQuota.commanders_will_reg = rawGold;
    baseQuota.commanders_will_kw = isKW ? rawGold : 0;
    baseQuota.loyal_servant = Number(tier.chests?.loyal_servant || 0);
    baseQuota.followers_heart = Number(tier.chests?.followers_heart || 0);
  }

  // 3. Intercept Active Wartime Buyout Installments
  const buyouts = rewardsState.wartime_buyouts || [];
  let buyoutBonus = { regular: 0, kw: 0 };
  let activeBuyoutTicket = null;
  let activeInstallmentIndex = -1;

  // Case A: Displaced Beneficiary Alliance receives bonus slots
  buyouts.forEach((buyout) => {
    if (buyout.status === "active" && buyout.beneficiary === cleanTag) {
      const instIdx = (buyout.installments || []).findIndex(
        (i) =>
          Number(i.week) === Number(currentWeek) &&
          (i.status === "pending" || i.status === "nominated"),
      );
      if (instIdx !== -1) {
        const inst = buyout.installments[instIdx];
        buyoutBonus.regular += Number(inst.payout?.regular || 0);
        buyoutBonus.kw += Number(inst.payout?.kw || 0);
        activeBuyoutTicket = buyout;
        activeInstallmentIndex = instIdx;
      }
    }
  });

  // Case B: WLO surrenders gold chests to fund the payout
  let wloDeduction = { regular: 0, kw: 0 };
  if (cleanTag === "WLO") {
    buyouts.forEach((buyout) => {
      if (buyout.status === "active") {
        const inst = (buyout.installments || []).find(
          (i) =>
            Number(i.week) === Number(currentWeek) &&
            (i.status === "pending" || i.status === "nominated"),
        );
        if (inst) {
          wloDeduction.regular += Number(inst.payout?.regular || 0);
          wloDeduction.kw += Number(inst.payout?.kw || 0);
        }
      }
    });
  }

  const effectiveGoldReg = Math.max(
    0,
    baseQuota.commanders_will_reg + buyoutBonus.regular - wloDeduction.regular,
  );
  const effectiveGoldKW = Math.max(
    0,
    baseQuota.commanders_will_kw + buyoutBonus.kw - wloDeduction.kw,
  );

  return {
    allianceTag: cleanTag,
    rank,
    currentWeek,
    isKW,
    hasBuyoutBonus: buyoutBonus.regular > 0 || buyoutBonus.kw > 0,
    isWloDeducted: wloDeduction.regular > 0 || wloDeduction.kw > 0,
    buyoutDetails: activeBuyoutTicket
      ? {
          ticketId: activeBuyoutTicket.id,
          threat: activeBuyoutTicket.threat,
          installmentIndex: activeInstallmentIndex,
          bonus: buyoutBonus,
        }
      : null,
    quotas: {
      commanders_will_regular: effectiveGoldReg,
      commanders_will_kw: effectiveGoldKW,
      loyal_servant: baseQuota.loyal_servant,
      followers_heart: baseQuota.followers_heart,
    },
  };
}

/**
 * Called by /rewards action:reset in api/interactions.js.
 * Marks current week's nominated buyout installments as fulfilled, archives completed tickets,
 * protects uncollected installments, updates lastReset, and advances the cycle week.
 */
export function applySafeCycleReset(
  rewardsState = {},
  requestedMode = "standard",
  username = "Leadership",
) {
  const currentWeek = rewardsState.cycle_state?.current_week ?? 1;

  if (!Array.isArray(rewardsState.wartime_buyouts)) rewardsState.wartime_buyouts = [];
  if (!Array.isArray(rewardsState.buyout_history)) rewardsState.buyout_history = [];

  const remainingBuyouts = [];
  let archivedCount = 0;
  let preservedCount = 0;

  rewardsState.wartime_buyouts.forEach((buyout) => {
    const inst = (buyout.installments || []).find(
      (i) => Number(i.week) === Number(currentWeek),
    );
    // Mark fulfilled if the alliance nominated their recipients for this week
    if (inst && inst.status === "nominated") {
      inst.status = "fulfilled";
      inst.fulfilledAt = new Date().toISOString();
    }

    const allDone = (buyout.installments || []).every(
      (i) => i.status === "fulfilled",
    );
    if (allDone) {
      archivedCount++;
      rewardsState.buyout_history.push({
        ...buyout,
        status: "fulfilled",
        archivedAt: new Date().toISOString(),
        archivedBy: username,
      });
    } else {
      preservedCount++;
      remainingBuyouts.push(buyout);
    }
  });

  const cycleAdvanced = currentWeek >= 3;
  rewardsState.wartime_buyouts = remainingBuyouts;
  rewardsState.cycle_state = advanceCycleState(rewardsState.cycle_state || {});
  rewardsState.mode = requestedMode;
  rewardsState.lastReset = new Date().toISOString();
  rewardsState.lastUpdated = new Date().toISOString();
  rewardsState.updatedBy = username;

  return {
    updatedRewards: rewardsState,
    archivedCount,
    preservedCount,
    cycleAdvanced,
    nextWeek: rewardsState.cycle_state.current_week,
  };
}