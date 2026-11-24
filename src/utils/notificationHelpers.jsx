import React from 'react';
import { Megaphone, Wrench, FileText } from 'lucide-react';
import { COLORS } from '../config/constants';

export function getNotificationTypeIcon(type, size = 14) {
    switch (type) {
        case 'announcement': return <Megaphone size={size} />;
        case 'maintenance': return <Wrench size={size} />;
        default: return <FileText size={size} />;
    }
}

export function getNotificationTypeColor(type) {
    switch (type) {
        case 'announcement': return COLORS.gold;
        case 'maintenance': return COLORS.orange;
        default: return COLORS.accent;
    }
}