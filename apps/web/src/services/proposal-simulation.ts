import { degovRestApi } from "@/utils/remote-api";

export interface ProposalSimulationCapability {
  enabled: boolean;
  reason?: string;
  modes?: string[];
  fidelity?: "basic" | "rich" | string;
  provider?: string;
  chainId?: number;
}

export interface ProposalSimulationPayload {
  caller: string;
  targets: string[];
  values: string[];
  calldatas: string[];
  descriptionHash: string;
}

export interface ProposalSimulationResult {
  status: "success" | "reverted";
  fidelity: "basic" | "rich";
  provider?: "native" | "tenderly" | string;
  chainId?: number;
  blockNumber?: number;
  simulatedAt?: string;
  caller?: string;
  governor?: string;
  gasUsed?: string | number;
  revert?: {
    reason?: string;
    data?: string;
  };
  calls?: unknown[];
  logs?: unknown[];
  assetChanges?: unknown[];
  stateChanges?: unknown[];
  warnings?: string[];
  providerReference?: string;
}

const readJson = async <T>(response: Response): Promise<T> => {
  const json = (await response.json().catch(() => ({}))) as
    | T
    | { error?: string };

  if (!response.ok) {
    const error = (json as { error?: unknown }).error;
    throw new Error(
      typeof error === "string" && error ? error : "Simulation request failed"
    );
  }

  return json as T;
};

const simulationUrl = (path: string) => {
  const baseUrl = degovRestApi();
  if (!baseUrl) return undefined;
  return `${baseUrl}${path}`;
};

export const getProposalSimulationCapability = async (daoCode: string) => {
  const url = simulationUrl(
    `/api/v1/daos/${encodeURIComponent(daoCode)}/proposal-simulation/capability`
  );
  if (!url) return { enabled: false };

  const response = await fetch(url);
  return readJson<ProposalSimulationCapability>(response);
};

export const simulateProposal = async ({
  daoCode,
  proposalId,
  payload,
}: {
  daoCode: string;
  proposalId: string;
  payload: ProposalSimulationPayload;
}) => {
  const url = simulationUrl(
    `/api/v1/daos/${encodeURIComponent(daoCode)}/proposals/${encodeURIComponent(
      proposalId
    )}/simulation`
  );
  if (!url) throw new Error("Simulation API is not configured");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson<ProposalSimulationResult>(response);
};
