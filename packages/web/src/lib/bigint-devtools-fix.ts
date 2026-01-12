// BigInt serialization fix for React DevTools (development only)
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

if (process.env.NODE_ENV === "development" && typeof BigInt !== "undefined") {
  BigInt.prototype.toJSON = function () {
    return this.toString();
  };
}

export {};
