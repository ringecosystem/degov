import type { ContributorItem } from "@/services/graphql/types";

import { degovConfig } from "./config";


export function inspectContributor(
  address: string
): Promise<ContributorItem | undefined> {
  const dc = degovConfig();
  const endpoint = dc.indexer.endpoint;
  const query = `
  query QueryContributor($id: String!) {
    contributors(where: {id_eq: $id}) {
      power
      id
      transactionHash
      blockTimestamp
      blockNumber
    }
  }
  `;
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: { id: address },
    }),
    next: { 
      revalidate: 60, // Cache for 1 minute
      tags: [`contributor-${address}`] 
    },
  })
    .then((res) => res.json())
    .then((res) => {
      if (res.errors) {
        console.error("inspectContributor", res.errors);
        return undefined;
      }
      return res.data.contributors[0];
    });
}
