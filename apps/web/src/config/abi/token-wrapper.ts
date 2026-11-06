import { parseAbi } from "viem";

export const tokenWrapperAbi = parseAbi([
  "function underlying() view returns (address)",
  "function token() view returns (address)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function delegates(address account) view returns (address)",
  "function getVotes(address account) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function depositFor(address account, uint256 amount) returns (bool)",
  "function withdrawTo(address account, uint256 amount) returns (bool)",
  "function delegate(address delegatee)",
]);
