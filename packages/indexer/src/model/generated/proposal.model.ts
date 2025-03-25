import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_, OneToMany as OneToMany_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"
import {VoteCastGroup} from "./voteCastGroup.model"

@Entity_()
export class Proposal {
    constructor(props?: Partial<Proposal>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    proposalId!: string

    @StringColumn_({nullable: false})
    proposer!: string

    @StringColumn_({array: true, nullable: false})
    targets!: (string)[]

    @StringColumn_({array: true, nullable: false})
    values!: (string)[]

    @StringColumn_({array: true, nullable: false})
    signatures!: (string)[]

    @StringColumn_({array: true, nullable: false})
    calldatas!: (string)[]

    @BigIntColumn_({nullable: false})
    voteStart!: bigint

    @BigIntColumn_({nullable: false})
    voteEnd!: bigint

    @StringColumn_({nullable: false})
    description!: string

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string

    @OneToMany_(() => VoteCastGroup, e => e.proposal)
    voters!: VoteCastGroup[]

    @IntColumn_({nullable: true})
    metricsVotesCount!: number | undefined | null

    @IntColumn_({nullable: true})
    metricsVotesWithParamsCount!: number | undefined | null

    @IntColumn_({nullable: true})
    metricsVotesWithoutParamsCount!: number | undefined | null

    @BigIntColumn_({nullable: true})
    metricsVotesWeightForSum!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    metricsVotesWeightAgainstSum!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    metricsVotesWeightAbstainSum!: bigint | undefined | null
}
