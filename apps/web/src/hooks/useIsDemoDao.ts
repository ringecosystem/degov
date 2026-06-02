import { useDaoConfig } from "./useDaoConfig";

export const useIsDemoDao = () => {
  const daoConfig = useDaoConfig();
  return daoConfig?.name === "DeGov Demo DAO";
};
