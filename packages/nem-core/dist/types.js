"use strict";
/**
 * types.ts — Core NEM type definitions
 *
 * Shared types for Node Editor Module across all platforms (server/web/desktop)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNeutralDevelopState = createNeutralDevelopState;
/**
 * Neutral/zero develop state (no adjustments)
 */
function createNeutralDevelopState() {
    return {
        exposure: 0,
        contrast: 0,
        highlights: 0,
        shadows: 0,
        whites: 0,
        blacks: 0,
        temperature: 6500, // Neutral white balance (daylight)
        tint: 0,
        vibrance: 0,
        saturation: 0,
        hue: 0,
        clarity: 0,
        dehaze: 0,
    };
}
