"use strict";
/**
 * @redbulb/nem-core
 *
 * RedBulb Node Editor Module - Core evaluation engine
 * Shared across server, web, and desktop platforms
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateNodeGraph = exports.createNeutralDevelopState = void 0;
var types_1 = require("./types");
Object.defineProperty(exports, "createNeutralDevelopState", { enumerable: true, get: function () { return types_1.createNeutralDevelopState; } });
// Evaluator
var evaluator_1 = require("./evaluator");
Object.defineProperty(exports, "evaluateNodeGraph", { enumerable: true, get: function () { return evaluator_1.evaluateNodeGraph; } });
