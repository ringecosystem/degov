export type SquidStatus = {
  finalizedHash?: string;
  height?: number;
  finalizedHeight?: number;
  hash?: string;
};

export type SquidStatusResponse = {
  squidStatus: SquidStatus;
};
