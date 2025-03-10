// import { useQuery } from "@tanstack/react-query";

// // fake getNonce function
// // /api/auth/nonce
// /*
// POST http://127.0.0.1:3000/api/auth/nonce

// {
//   "code": 0,
//   "data": {
//     "nonce": "ab490d1aec806b732717c24f6946379c5ba3a5fd0a9b736328043cbf5328a6da"
//   }
// }
// */
// const getNonce = (): Promise<{ data: { nonce: number } }> => {
//   return new Promise((resolve) => {
//     setTimeout(() => {
//       resolve({
//         data: {
//           nonce: Math.floor(Math.random() * 1000000),
//         },
//       });
//     }, 1000);
//   });
// };

// // /api/auth/login
// /*
// POST http://127.0.0.1:3000/api/auth/login
// Content-Type: application/json
// x-degov-nonce: ab490d1aec806b732717c24f6946379c5ba3a5fd0a9b736328043cbf5328a6da

// {
//   "message": "0xq3423523",
//   "signature": "0x23423534"
// }
// */
// const login = (): Promise<{ data: { nonce: number } }> => {
//   return new Promise((resolve) => {
//     setTimeout(() => {
//       resolve({
//         data: {
//           nonce: Math.floor(Math.random() * 1000000),
//         },
//       });
//     }, 1000);
//   });
// };

// // GET /api/profile/0x3425235
// /*
// GET http://60.214.102.126:3000/api/profile/0x2376628375284594
// */
// const fetchProfile = (): Promise<{ data: { nonce: number } }> => {
//   return new Promise((resolve) => {
//     setTimeout(() => {
//       resolve({
//         data: {
//           nonce: Math.floor(Math.random() * 1000000),
//         },
//       });
//     }, 1000);
//   });
// };


// // POST /api/profile/0x3425235
// /*
// POST http://60.214.102.126:3000/api/profile/0x2376628375284595
// Authorization: Bearer {{$global.DEGOV_TOKEN}}

// {
//   "name": "Boster",
//   "avatar": "https://darwinia.network/images/darwinia-logo-black-background-round.svg",
//   "email": "hi@darwinia.network",
//   "twitter": "https://x.com/darwinianetwork",
//   "github": "https://github.com/darwinia-network",
//   "discord": "https://discord.gg/rMRWY52AaJ",
//   "additional": "{\"medium\": \"https://medium.com/darwinianetwork\"}"
// }
// */
// const updateProfile = (): Promise<{ data: { nonce: number } }> => {
//   return new Promise((resolve) => {
//     setTimeout(() => {
//       resolve({
//         data: {
//           nonce: Math.floor(Math.random() * 1000000),
//         },
//       });
//     }, 1000);
//   });
// };

// export function useApi() {
//   const { refetch, ...proposalsQuery } = useQuery({
//     queryKey: ["query-nonce"],
//     queryFn: async () => {
//       const response = await getNonce();
//       return response?.data?.nonce;
//     },
//     enabled: true,
//   });

//   return {
//     refetch,
//     ...proposalsQuery,
//   };
// }

// export default useApi;

// // how to use the useApi hook
// // must use the refetch function to get the data
// // the data is not updated automatically

// // const { refetch, ...proposalsQuery } = useApi();
// // console.log(proposalsQuery);

// // example

// // ```tsx
// // const { refetch, ...proposalsQuery } = useApi();
// // console.log(proposalsQuery);

// // const handleRefetch = async () => {
// //   const data = await refetch();
// //   console.log(data);
// // };

// // // use the handleRefetch function to refetch the data
// // handleRefetch();
// // ```;

// // example 2

// // ```tsx
// // const { refetch, data, isLoading, isFetching, isError } = useApi();
// // console.log(data);

// // const handleRefetch = async () => {
// //   refetch();
// // };

// // console.log(data);

// // // use the handleRefetch function to refetch the data
// // handleRefetch();
// // ```;