import { gql } from "graphql-request";

export const GET_ENS_RECORD = gql`
  query GetEnsRecord($address: String, $name: String, $daoCode: String) {
    ens(input: { address: $address, name: $name, daoCode: $daoCode }) {
      address
      name
    }
  }
`;
