import type { ContributorItem } from "@/services/graphql/types";

import * as config from "./config";

import type { NextRequest } from "next/server";

const CONTRIBUTOR_QUERY = `
  query QueryContributors(
    $ids: [String!]!
    $limit: Int!
    $chainId: Int!
    $governorAddress: String!
    $daoCode: String!
  ) {
    contributors(
      limit: $limit
      where: {
        id_in: $ids
        chainId_eq: $chainId
        governorAddress_eq: $governorAddress
        daoCode_eq: $daoCode
      }
    ) {
      power
      id
      transactionHash
      blockTimestamp
      blockNumber
      lastVoteTimestamp
      delegatesCountAll
    }
  }
`;

const CONTRIBUTOR_BATCH_SIZE = 200;

type ContributorResponse = {
  data?: {
    contributors?: ContributorItem[];
  };
  errors?: unknown;
};

const chunkAddresses = (addresses: string[], size: number) => {
  const chunks: string[][] = [];

  for (let index = 0; index < addresses.length; index += size) {
    chunks.push(addresses.slice(index, index + size));
  }

  return chunks;
};

async function fetchContributors(options: {
  request: NextRequest;
  addresses: string[];
}): Promise<ContributorItem[]> {
  const uniqueAddresses = Array.from(
    new Set(options.addresses.map((address) => address.toLowerCase()))
  );

  if (!uniqueAddresses.length) {
    return [];
  }

  const dc = await config.degovConfig(options.request);
  if (!dc) {
    console.error("degovConfig is not available");
    return [];
  }

  const endpoint = dc.indexer.endpoint;
  const addressChunks = chunkAddresses(uniqueAddresses, CONTRIBUTOR_BATCH_SIZE);

  const responses = await Promise.all(
    addressChunks.map((addresses) =>
      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: CONTRIBUTOR_QUERY,
          variables: {
            ids: addresses,
            limit: addresses.length,
            chainId: dc.chain.id,
            governorAddress: dc.contracts.governor.toLowerCase(),
            daoCode: dc.code,
          },
        }),
        next: {
          revalidate: 60,
          tags: addresses.map((address) => `contributor-${address}`),
        },
      }).then((res) => res.json() as Promise<ContributorResponse>)
    )
  );

  const contributors: ContributorItem[] = [];

  for (const response of responses) {
    if (response.errors) {
      console.error("fetchContributors", response.errors);
      continue;
    }

    contributors.push(...(response.data?.contributors ?? []));
  }

  return contributors;
}

export async function inspectContributor(options: {
  request: NextRequest;
  address: string;
}): Promise<ContributorItem | undefined> {
  const [contributor] = await fetchContributors({
    request: options.request,
    addresses: [options.address],
  });

  return contributor;
}

export async function inspectContributors(options: {
  request: NextRequest;
  addresses: string[];
}): Promise<ContributorItem[]> {
  return fetchContributors(options);
}

export async function inspectContributorsByAddress(options: {
  request: NextRequest;
  addresses: string[];
}): Promise<Map<string, ContributorItem>> {
  const contributors = await fetchContributors(options);

  return new Map(
    contributors.map((contributor) => [contributor.id.toLowerCase(), contributor])
  );
}
