#!/usr/bin/env python3
# Copyright (c) 2026-present The DeroM developers
# Distributed under the MIT software license, see the accompanying
# file COPYING or https://opensource.org/license/mit/.
"""Smoke-test DeroM mainnet identity, pool RPC template, and wallet addresses."""

from test_framework.test_framework import BitcoinTestFramework
from test_framework.util import assert_equal


class DeroMMainnetRPCTest(BitcoinTestFramework):
    def set_test_params(self):
        self.num_nodes = 1
        self.setup_clean_chain = True
        self.chain = ""  # DeroM mainnet
        # This smoke test intentionally starts with only genesis and no public peers.
        self.extra_args = [["-maxtipage=3153600000"]]

    def run_test(self):
        node = self.nodes[0]
        assert_equal(node.getblockchaininfo()["chain"], "main")
        assert_equal(node.getblockhash(0), "0000000856d6d4820f05d39679b5837b1802f8689794655519da0213df01324a")

        template = node.getblocktemplate({"rules": ["segwit"]})
        assert_equal(template["height"], 1)
        assert_equal(template["coinbasevalue"], 250 * 100_000_000)
        assert_equal(template["bits"], "1e00ffff")

        node.createwallet("derom-functional", False, False, "test-only-passphrase")
        wallet = node.get_wallet_rpc("derom-functional")
        address = wallet.getnewaddress("", "bech32")
        assert_equal(address.startswith("derom1"), True)
        assert_equal(wallet.getbalance(), 0)


if __name__ == "__main__":
    DeroMMainnetRPCTest(__file__).main()
