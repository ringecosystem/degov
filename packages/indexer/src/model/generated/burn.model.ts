import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, IntColumn as IntColumn_, StringColumn as StringColumn_, Index as Index_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class Burn {
    constructor(props?: Partial<Burn>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @IntColumn_({nullable: false})
    block!: number

    @Index_()
    @StringColumn_({nullable: false})
    address!: string

    @BigIntColumn_({nullable: false})
    value!: bigint

    @StringColumn_({nullable: false})
    txHash!: string
}
