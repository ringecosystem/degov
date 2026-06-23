import { isDemoDaoConfig } from "@/utils/is-demo-dao";

import { useDaoConfig } from "./useDaoConfig";

export const useIsDemoDao = () => {
  const daoConfig = useDaoConfig();
  return isDemoDaoConfig(daoConfig);
};
