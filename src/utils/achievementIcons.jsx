// Whitelist instead of `import * as LucideIcons` (~150-200KB). Unknown names fall back to Award.

import {
    Disc3,
    CircleDot,
    HelpCircle,

    Gem,
    Sparkles,
    Crown,
    Package,
    Archive,
    Trophy,
    Eclipse,
    Sparkle,
    // New achievement icons are added here, not left to the Award fallback.
    Atom,
    Medal,

    RefreshCw,
    Zap,
    Orbit,
    Flame,
    Infinity,
    Star,
    Mountain,
    Code,
    Dice5,
    Frown,
    Skull,
    Ghost,

    Gift,
    PartyPopper,
    Target,
    Rocket,
    Layers3,
    Clover,

    Layers,
    Castle,
    Copy,
    Files,        // Fallback for FolderCopy which doesn't exist
    Database,
    HardDrive,
    CopyPlus,
    House,

    RotateCcw,
    RefreshCcw,
    Coins,
    Moon,
    Sunrise,
    HeartCrack,

    Award
} from 'lucide-react';

// FolderCopy doesn't exist in lucide-react, so it maps to Files.
export const ACHIEVEMENT_ICON_MAP = {
    Disc3,
    CircleDot,
    HelpCircle,

    Gem,
    Sparkles,
    Crown,
    Package,
    Archive,
    Trophy,
    Eclipse,
    Sparkle,
    Atom,
    Medal,

    RefreshCw,
    Zap,
    Orbit,
    Flame,
    Infinity,
    Star,
    Mountain,
    Code,
    Dice5,
    Frown,
    Skull,
    Ghost,

    Gift,
    PartyPopper,
    Target,
    Rocket,
    Layers3,
    Clover,

    Layers,
    Castle,
    Copy,
    FolderCopy: Files,
    Database,
    HardDrive,
    CopyPlus,
    House,

    RotateCcw,
    RefreshCcw,
    Coins,
    Moon,
    Sunrise,
    HeartCrack,

    Award
};

export const DEFAULT_ACHIEVEMENT_ICON = Award;

export function getAchievementIcon(name) {
    return ACHIEVEMENT_ICON_MAP[name] || DEFAULT_ACHIEVEMENT_ICON;
}

export function AchievementIcon({ name, size = 16, color, style = {} }) {
    const IconComponent = ACHIEVEMENT_ICON_MAP[name] || DEFAULT_ACHIEVEMENT_ICON;
    return <IconComponent size={size} color={color} style={style} />;
}