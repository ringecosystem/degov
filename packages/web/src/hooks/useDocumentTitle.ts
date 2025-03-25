import { useEffect } from "react";

import { useDaoConfig } from "./useDaoConfig";

export const useDocumentTitle = () => {
  const daoConfig = useDaoConfig();
  useEffect(() => {
    // if (daoConfig?.name) {
    //   document.title = `${daoConfig.name} - Powered by DeGov.AI`;
    // }
  }, [daoConfig?.name]);
};
