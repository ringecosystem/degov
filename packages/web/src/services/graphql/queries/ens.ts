import { gql } from "graphql-request";

export const GET_ENS_RECORD = gql`
  query GetEnsRecord($address: String, $name: String, $daoCode: String) {
    ens(input: { address: $address, name: $name, daoCode: $daoCode }) {
      address
      name
    }
  }
`;

export const GET_ENS_RECORDS = gql`
  query GetEnsRecords(
    $addresses: [String!]
    $names: [String!]
    $daoCode: String
  ) {
    ensRecords(input: { addresses: $addresses, names: $names, daoCode: $daoCode }) {
      address
      name
    }
  }
`;
