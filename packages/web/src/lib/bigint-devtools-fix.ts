declare global {
  interface BigInt {
    toJSON(): string;
  }
}

if (
  process.env.NODE_ENV === "development" &&
  typeof BigInt !== "undefined" &&
  !BigInt.prototype.toJSON
) {
  BigInt.prototype.toJSON = function () {
    return this.toString();
  };
}

export {};
