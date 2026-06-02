import { gql } from "graphql-request";

export const GET_TREASURY_ASSETS = gql`
  query GetTreasuryAssets($chain: String!, $address: String!) {
    treasuryAssets(input: { chain: $chain, address: $address }) {
      address
      balance
      balanceRaw
      balanceUSD
      chain
      displayDecimals
      logo
      name
      native
      price
      symbol
      decimals
      historicalPrices {
        price
        timestamp
      }
    }
  }
`;
