export const AiReview = () => {
  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
        <h3 className="text-[26px] font-semibold text-foreground">
          AI summary
        </h3>
        <p className="text-[14px] font-normal">
          This RingDAO proposal aims to transition RING into a deflationary
          token by eliminating all future token issuance, thereby removing the
          estimated 200M RING that would have been created. This change is
          intended to strengthen RING's value, stabilize its economy, and
          alleviate pressure on the Treasury. Additionally, the proposal
          outlines a shift for Collator and Kton staking rewards to a fixed,
          Treasury-funded model, allocating 40M RING to each, to ensure
          predictable and continued incentivization for network participation.
          If approved, these changes will be implemented via a whitelist runtime
          upgrade.
        </p>
      </div>

      <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
        <h3 className="text-[26px] font-semibold text-foreground">
          Vote suggestion
        </h3>
        <p className="text-[14px] font-normal">
          Voters are encouraged to consider supporting this proposal if they
          favor a deflationary model for RING, which aims to enhance its
          long-term scarcity and value. The adjustments to staking rewards offer
          a sustainable and predictable incentive structure funded by the
          existing Treasury. Approving this proposal would align with the
          strategic shift owards a more stable and economically sound ecosystem
          for RING.
        </p>
      </div>
    </div>
  );
};
