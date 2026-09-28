# DeroM development-chain tokenomics

## Proposed purpose

DeroM is currently an educational SHA-256 proof-of-work experiment for home miners who want to run a node and solo-mine with ordinary SHA-256 ASIC equipment. It has no payment utility, exchange listing, market value, or public network. The name should be changed before public promotion: “DeroM” can be confused with the existing DERO project.

## Issuance rules in this prototype

| Item | Rule |
|---|---|
| Maximum coinbase issuance | 100,000,000 DERM |
| Premine | 0 DERM; genesis has no spendable subsidy |
| Initial block subsidy | 250 DERM |
| Block target | 300 seconds (5 minutes) on average; not a guaranteed schedule |
| Halvings | None in this prototype |
| Fees | None; user transactions are not implemented |
| Cap handling | Subsidy is reduced to the remaining amount for the final block, then becomes zero |
| Allocation | The entire block subsidy is paid to the address in the accepted solo-mining block |

At exactly 300 seconds per block, 250 DERM per block would issue at most 72,000 DERM per day and reach the cap after 400,000 subsidy blocks (about 3.8 years). Actual time varies with mining and retargeting. The chain has no peer synchronization, so this cap currently applies only to the local node's data.

These values are proposal-level development settings, not a promise of scarcity or value. Any shared testnet or mainnet requires a versioned consensus specification, genesis parameters, independently reviewed emission logic, and migration rules before launch.
