import erc1155Abi from "@/assets/abi/erc1155.json";
import erc20Abi from "@/assets/abi/erc20.json";
import erc721Abi from "@/assets/abi/erc721.json";
import igovernorAbi from "@/assets/abi/igovernor.json";
import ownable2stepAbi from "@/assets/abi/ownable2step.json";
import upgradeabilityAbi from "@/assets/abi/uupsupgradeable.json";

import type { Abi } from "viem";

export const abiList = [
  {
    name: "erc20",
    abi: erc20Abi as Abi,
    label: "ERC-20",
  },
  {
    name: "erc721",
    abi: erc721Abi as Abi,
    label: "ERC-721",
  },
  {
    name: "erc1155",
    abi: erc1155Abi as Abi,
    label: "ERC-1155",
  },
  {
    name: "igovernor",
    abi: igovernorAbi as Abi,
    label: "IGovernor",
  },
  {
    name: "ownable2step",
    abi: ownable2stepAbi as Abi,
    label: "Ownable2Step",
  },
  {
    name: "upgradeability",
    abi: upgradeabilityAbi as Abi,
    label: "Upgradeability (UUPS)",
  },
];
