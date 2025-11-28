/**
 * BigInt serialization polyfill for JSON.stringify
 * This fixes React DevTools errors when components have BigInt in their props/state
 */

// Extend BigInt prototype to add toJSON method
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

// Only add polyfill if not already present
if (typeof BigInt !== 'undefined' && !BigInt.prototype.toJSON) {
  BigInt.prototype.toJSON = function () {
    return this.toString();
  };
}

export {};
