export const getBotAddress = async (endpoint: string) => {
  const response = await fetch(`${endpoint}/degov/bot-address`, {
    method: "GET",
  });
  const data: { code: number; data: { address: string } } =
    await response.json();
  return data;
};

export const getProposalSummary = async (
  endpoint: string,
  proposal: {
    chain: number;
    indexer: string;
    id: string;
  }
) => {
  const response = await fetch(`${endpoint}/degov/proposal/summary`, {
    method: "POST",
    body: JSON.stringify(proposal),
    headers: {
      "Content-Type": "application/json",
    },
  });
  const data: { code: number; data: string } = await response.json();
  return data;
};
