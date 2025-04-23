/**
 * routes
 */
// Define a proper type for the routes
export type Route = {
  key: string;
  pathname: string;
  children?: {
    key: string;
    pathname: string;
  }[];
};
export const routes: Route[] = [
  {
    key: "dashboard",
    pathname: "/",
  },
  {
    key: "proposals",
    pathname: "/proposals",
    children: [
      {
        key: "All Proposals",
        pathname: "/proposals/all",
      },
      {
        key: "My Proposals",
        pathname: "/proposals/my",
      },
    ],
  },
  {
    key: "delegates",
    pathname: "/delegates",
  },
  {
    key: "profile",
    pathname: "/profile",
  },
  {
    key: "treasury",
    pathname: "/treasury",
    children: [
      {
        key: "TimeLock Assets",
        pathname: "/treasury/timelock",
      },
      {
        key: "Safe Assets",
        pathname: "/treasury/safe",
      },
    ],
  },
];
