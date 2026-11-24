// The five global events' icons, companion to `EVENT_IDENTITY` in constants.js (name and colour). A separate module so plain logic can import the identity without a component library; the glyph is shared because three surfaces (selection wheel, odds register, event log) would otherwise disagree on it, while the size stays each surface's own call.
// Load-bearing: THE PARLOUR's green (#19B36B) and the Community Goal's teal (#2DD4BF) are the closest pair in the identity table, and the icon is what separates them.

import { TrainFront, Crown, Crosshair, Target, CircleDot, Spade } from 'lucide-react';

export const EVENT_ICONS = {
    arrival: TrainFront,
    king_of_wheel: Crown,
    first_blood: Crosshair,
    community_goal: Target,
    roulette: CircleDot,
    high_roller: Spade,
};

export default EVENT_ICONS;
