import { useActivity } from '../../../context/ActivityContext.jsx';

/** Whether an event owns the banner slot right now. Shared with the daily bounty's plaque, which must step aside at the same moments. */
export function useEventSlotBusy() {
    const { globalEventStatus, eventSelection,
        communityGoalResult, communityGoalResultPending, firstBloodWinner,
        firstBloodResultPending, kotwWinner, kotwWinnerPending, roulette, highRoller } = useActivity();

    // `eventSelection` counts as active: the roll fires before the event flips active and would stack with the meter.
    const active = globalEventStatus?.active || globalEventStatus?.pending || !!eventSelection;

    // The aftermath counts too: a result/winner sits in this slot for a fixed window (12s community goal, 8s first
    // blood, 30s king of the wheel) after `global_event_end` clears `active`. Include the pending flags: they cover
    // the gap between the end broadcast and the result landing.
    const aftermathVisible = !!communityGoalResult || communityGoalResultPending
        || !!firstBloodWinner || firstBloodResultPending
        || !!kotwWinner || kotwWinnerPending;
    // THE PARLOUR counts as active while the room is on screen, asked separately from `globalEventStatus`: the server
    // closes the event ~0.4s after the client's teardown timer is due, and a late `roulette_result` or throttled tab
    // pushes that timer past the end broadcast. `roulette` being set is the actual question.
    return active || aftermathVisible || !!roulette || !!highRoller;
}
