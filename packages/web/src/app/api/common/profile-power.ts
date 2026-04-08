import type { ContributorItem } from "../../../services/graphql/types/contributors";

export type ContributorMap = Map<string, ContributorItem>;
export type StoredProfileRow = {
  id: string;
  dao_code: string;
  address: string;
  name?: string | null;
  email?: string | null;
  twitter?: string | null;
  github?: string | null;
  discord?: string | null;
  telegram?: string | null;
  medium?: string | null;
  delegate_statement?: string | null;
  additional?: string | null;
  last_login_time: string;
  ctime?: string | null;
  utime?: string | null;
  avatar?: string | null;
};

const DEFAULT_POWER = "0";

const getTimestampValue = (value?: string | null) => {
  const parsed = Date.parse(value ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getContributorPower = (
  contributorsByAddress: ContributorMap,
  address: string
) => contributorsByAddress.get(address.toLowerCase())?.power ?? DEFAULT_POWER;

export function overlayProfileWithContributorPower<
  T extends { address: string },
>(profile: T, contributorsByAddress: ContributorMap): T & { power: string } {
  return {
    ...profile,
    power: getContributorPower(contributorsByAddress, profile.address),
  };
}

export function overlayProfilesWithContributorPower<
  T extends { address: string },
>(profiles: T[], contributorsByAddress: ContributorMap): Array<T & { power: string }> {
  return profiles.map((profile) =>
    overlayProfileWithContributorPower(profile, contributorsByAddress)
  );
}

export function rankMembersByContributorPower<
  T extends { address: string; ctime?: string | null },
>(
  members: T[],
  contributorsByAddress: ContributorMap
): Array<T & { power: string; rn: number }> {
  const hydratedMembers = overlayProfilesWithContributorPower(
    members,
    contributorsByAddress
  );

  hydratedMembers.sort((left, right) => {
    const powerDiff =
      BigInt(right.power) - BigInt(left.power);

    if (powerDiff !== 0n) {
      return powerDiff > 0n ? 1 : -1;
    }

    return getTimestampValue(right.ctime) - getTimestampValue(left.ctime);
  });

  return hydratedMembers.map((member, index) => ({
    ...member,
    rn: index + 1,
  }));
}
