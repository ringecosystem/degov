import { useQuery } from "@tanstack/react-query";

// fake getNonce function
// /api/auth/nonce
const getNonce = (): Promise<{ data: { nonce: number } }> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        data: {
          nonce: Math.floor(Math.random() * 1000000),
        },
      });
    }, 1000);
  });
};

// /api/auth/login
const login = (): Promise<{ data: { nonce: number } }> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        data: {
          nonce: Math.floor(Math.random() * 1000000),
        },
      });
    }, 1000);
  });
};

// GET /api/profile/0x3425235
const fetchProfile = (): Promise<{ data: { nonce: number } }> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        data: {
          nonce: Math.floor(Math.random() * 1000000),
        },
      });
    }, 1000);
  });
};


// POST /api/profile/0x3425235
const updateProfile = (): Promise<{ data: { nonce: number } }> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        data: {
          nonce: Math.floor(Math.random() * 1000000),
        },
      });
    }, 1000);
  });
};

export function useApi() {
  const { refetch, ...proposalsQuery } = useQuery({
    queryKey: ["query-nonce"],
    queryFn: async () => {
      const response = await getNonce();
      return response?.data?.nonce;
    },
    enabled: true,
  });

  return {
    refetch,
    ...proposalsQuery,
  };
}

export default useApi;

// how to use the useApi hook
// must use the refetch function to get the data
// the data is not updated automatically

// const { refetch, ...proposalsQuery } = useApi();
// console.log(proposalsQuery);

// example

// ```tsx
// const { refetch, ...proposalsQuery } = useApi();
// console.log(proposalsQuery);

// const handleRefetch = async () => {
//   const data = await refetch();
//   console.log(data);
// };

// // use the handleRefetch function to refetch the data
// handleRefetch();
// ```;

// example 2

// ```tsx
// const { refetch, data, isLoading, isFetching, isError } = useApi();
// console.log(data);

// const handleRefetch = async () => {
//   refetch();
// };

// console.log(data);

// // use the handleRefetch function to refetch the data
// handleRefetch();
// ```;