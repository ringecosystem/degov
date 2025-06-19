export const getBotAddress = async () => {
  const response = await fetch("https://agent.degov.ai/degov/bot-address", {
    method: "GET",
  });
  const data: { code: number; data: { address: string } } =
    await response.json();
  return data;
};

export const getProposalSummary = async (proposal: {
  chain: number;
  indexer: string;
  id: string;
}) => {
  const response = await fetch(
    "https://agent.degov.ai/degov/proposal/summary",
    {
      method: "POST",
      body: JSON.stringify(proposal),
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
  const data: { code: number; data: string } = await response.json();
  return data;
};
