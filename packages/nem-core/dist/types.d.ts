/**
 * types.ts — Core NEM type definitions
 *
 * Shared types for Node Editor Module across all platforms (server/web/desktop)
 */
/**
 * Complete develop state for a single image
 * Matches RedBulb/RapidRAW processing pipeline
 */
export interface DevelopState {
    exposure: number;
    contrast: number;
    highlights: number;
    shadows: number;
    whites: number;
    blacks: number;
    temperature: number;
    tint: number;
    vibrance: number;
    saturation: number;
    hue: number;
    clarity: number;
    dehaze: number;
    curves?: {
        master?: Array<{
            x: number;
            y: number;
        }>;
        red?: Array<{
            x: number;
            y: number;
        }>;
        green?: Array<{
            x: number;
            y: number;
        }>;
        blue?: Array<{
            x: number;
            y: number;
        }>;
    };
    curveEndpoints?: {
        master?: {
            black?: {
                x: number;
                y: number;
            };
            white?: {
                x: number;
                y: number;
            };
        };
        red?: {
            black?: {
                x: number;
                y: number;
            };
            white?: {
                x: number;
                y: number;
            };
        };
        green?: {
            black?: {
                x: number;
                y: number;
            };
            white?: {
                x: number;
                y: number;
            };
        };
        blue?: {
            black?: {
                x: number;
                y: number;
            };
            white?: {
                x: number;
                y: number;
            };
        };
    };
    colorWheels?: {
        shadows?: {
            hue: number;
            sat: number;
            lum: number;
        };
        midtones?: {
            hue: number;
            sat: number;
            lum: number;
        };
        highlights?: {
            hue: number;
            sat: number;
            lum: number;
        };
    };
    hsl?: {
        red?: {
            h: number;
            s: number;
            l: number;
        };
        orange?: {
            h: number;
            s: number;
            l: number;
        };
        yellow?: {
            h: number;
            s: number;
            l: number;
        };
        green?: {
            h: number;
            s: number;
            l: number;
        };
        aqua?: {
            h: number;
            s: number;
            l: number;
        };
        blue?: {
            h: number;
            s: number;
            l: number;
        };
        purple?: {
            h: number;
            s: number;
            l: number;
        };
        magenta?: {
            h: number;
            s: number;
            l: number;
        };
    };
    details?: {
        texture?: number;
        sharpness?: number;
        noiseReduction?: number;
        clarity?: number;
    };
    effects?: {
        vignette?: number;
        vignetteMidpoint?: number;
        vignetteRoundness?: number;
        vignetteFeather?: number;
        vignetteHighlights?: number;
        grain?: number;
        grainSize?: number;
        grainRoughness?: number;
        fade?: number;
    };
    toneMapper?: 'none' | 'aces' | 'reinhard' | 'filmic' | 'uncharted';
    geometry?: {
        rotation?: number;
        distortion?: number;
        vertical?: number;
        horizontal?: number;
        scale?: number;
    };
}
/**
 * A single node in the editor graph
 */
export interface Node {
    id: string;
    label: string;
    bypass: boolean;
    position: {
        x: number;
        y: number;
    };
    state: DevelopState;
}
/**
 * Connection between nodes
 */
export interface NodeConnection {
    from: string;
    to: string;
}
/**
 * Complete node graph structure
 */
export interface NodeGraph {
    nodes: Node[];
    connections: NodeConnection[];
}
/**
 * Options for graph evaluation
 */
export interface EvalOptions {
    stopAtNodeId?: string;
    includeBypassed?: boolean;
}
/**
 * Result of graph evaluation
 */
export interface EvalResult {
    flattenedState: DevelopState;
    evaluatedNodeIds: string[];
    warnings: string[];
}
/**
 * Neutral/zero develop state (no adjustments)
 */
export declare function createNeutralDevelopState(): DevelopState;
