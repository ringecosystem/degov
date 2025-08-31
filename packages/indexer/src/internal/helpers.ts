export class DegovIndexerHelpers {
  static safeJsonStringify(
    value: any,
    replacer: (key: string, value: any) => any = (_, v) => v
  ): string {
    return JSON.stringify(value, (_, v) => {
      if (typeof v === "bigint") {
        return v.toString();
      }
      return v;
    });
  }
}
