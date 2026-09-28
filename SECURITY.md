# Security policy

## Project status

DeroM is an experimental, single-node development chain. It is not safe for valuable funds, public mining, or production RPC exposure. Wallet and consensus code have not received independent security review.

## Reporting a vulnerability

Do not publish exploitable details in a public issue. The source is published at [github.com/Brage321/DeroM.](https://github.com/Brage321/DeroM.). Use GitHub's private vulnerability reporting for this repository if it is enabled. If private reporting is unavailable, contact the project owner through a private channel before disclosing a vulnerability.

## Scope

In-scope areas include consensus and difficulty calculations, Stratum share/block validation, wallet key generation/encryption/backup, HTTP request handling, local data integrity, and build/release workflows. Please include the affected version, reproduction steps, expected impact, and any safe proof of concept. Never include a real private key, wallet backup, passphrase, or valuable credential in a report.

## Release guidance

Do not connect this prototype to public networks or funds. A release intended for public use requires an independent cryptography and consensus review, a documented disclosure contact, signed artifacts, and a tested upgrade/recovery process.
