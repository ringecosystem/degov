import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class DelegateMapping {
    constructor(props?: Partial<DelegateMapping>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    from!: string

    @StringColumn_({nullable: false})
    to!: string

    @BigIntColumn_({nullable: false})
    blockNumber!: bigint

    @BigIntColumn_({nullable: false})
    blockTimestamp!: bigint

    @StringColumn_({nullable: false})
    transactionHash!: string
}
