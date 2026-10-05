#!/usr/bin/env python3
# Copyright (c) 2026-present The DeroM developers
# Distributed under the MIT software license, see the accompanying
# file COPYING or https://opensource.org/license/mit/.
"""Exercise DeroM GBT work, wallet payout address, and accepted block submission."""

from test_framework.address import address_to_scriptpubkey
from test_framework.blocktools import add_witness_commitment, create_block, create_coinbase
from test_framework.test_framework import BitcoinTestFramework
from test_framework.util import assert_equal


class DeroMTestnetPoolRPCTest(BitcoinTestFramework):
    def set_test_params(self):
        self.num_nodes = 1
        self.setup_clean_chain = True
        self.chain = "testnet4"
        # This isolated smoke test intentionally has no public peer nodes.
        self.extra_args = [["-maxtipage=3153600000"]]

    def run_test(self):
        node = self.nodes[0]
        node.createwallet("derom-pool-test", False, False, "test-only-passphrase")
        wallet = node.get_wallet_rpc("derom-pool-test")
        payout_address = wallet.getnewaddress("", "bech32")
        assert_equal(payout_address.startswith("tdr1"), True)

        template = node.getblocktemplate({"rules": ["segwit"]})
        assert_equal(template["height"], 1)
        assert_equal(template["coinbasevalue"], 250 * 100_000_000)
        assert_equal(template["bits"], "207fffff")

        coinbase = create_coinbase(
            height=template["height"],
            script_pubkey=address_to_scriptpubkey(payout_address),
            nValue=250,
        )
        block = create_block(tmpl=template, coinbase=coinbase)
        add_witness_commitment(block)
        block.solve()

        assert_equal(node.submitblock(block.serialize().hex()), None)
        assert_equal(node.getblockcount(), 1)
        assert_equal(node.getblocktemplate({"rules": ["segwit"]})["height"], 2)


if __name__ == "__main__":
    DeroMTestnetPoolRPCTest(__file__).main()
