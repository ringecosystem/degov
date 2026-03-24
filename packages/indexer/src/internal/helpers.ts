import { ContractName, IndexerWork } from "../types";

export interface ProposalScopeWhereOptions {
  chainId: number;
  governorAddress: string;
  proposalId: string;
}

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

  static normalizeAddress(value?: string | null): string | undefined {
    return value?.toLowerCase();
  }

  static findContractAddress(
    work: IndexerWork,
    contractName: ContractName
  ): string | undefined {
    return this.normalizeAddress(
      work.contracts.find((item) => item.name === contractName)?.address
    );
  }

  static proposalScopeWhere(options: ProposalScopeWhereOptions) {
    return {
      chainId: options.chainId,
      governorAddress: this.normalizeAddress(options.governorAddress),
      proposalId: options.proposalId,
    };
  }
}
