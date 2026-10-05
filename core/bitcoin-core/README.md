DeroM Core
==========

DeroM Core is an experimental Bitcoin Core 31.1 fork with DeroM-specific
genesis, SHA-256d proof-of-work parameters, issuance cap, address encoding,
network identity, and data/config paths. The upstream node, P2P, wallet,
validation, and JSON-RPC implementation remains MIT-licensed Bitcoin Core code.

This source tree is not an official Bitcoin Core release and has not yet passed
a complete build in the maintainer's local environment. See the repository
root's `POOL_INTEGRATION.md` and `POOL_REVIEW.md` for DeroM network status and
the checks still required before a public launch. Upstream build instructions
and developer documentation are retained under `doc/`.

License
-------

The Bitcoin Core-derived code and DeroM fork are distributed under the MIT
license. Upstream notices are retained; see [COPYING](COPYING).

Development Process
-------------------

The source here is pinned to the Bitcoin Core 31.1 commit recorded in
[`FORK_BASE.md`](FORK_BASE.md) and modified for DeroM. Bitcoin Core's release
tags and stability claims do not apply to this fork.

The https://github.com/bitcoin-core/gui repository is used exclusively for the
development of the GUI. Its master branch is identical in all monotree
repositories. Release branches and tags do not exist, so please do not fork
that repository unless it is for development reasons.

The contribution workflow is described in [CONTRIBUTING.md](CONTRIBUTING.md)
and useful hints for developers can be found in [doc/developer-notes.md](doc/developer-notes.md).

Testing
-------

Testing and code review is the bottleneck for development; we get more pull
requests than we can review and test on short notice. Please be patient and help out by testing
other people's pull requests, and remember this is a security-critical project where any mistake might cost people
lots of money.

### Automated Testing

Developers are strongly encouraged to write [unit tests](src/test/README.md) for new code, and to
submit new unit tests for old code. Unit tests can be compiled and run
(assuming they weren't disabled during the generation of the build system) with: `ctest`. Further details on running
and extending unit tests can be found in [/src/test/README.md](/src/test/README.md).

There are also [regression and integration tests](/test), written
in Python.
These tests can be run (if the [test dependencies](/test) are installed) with: `build/test/functional/test_runner.py`
(assuming `build` is your build directory).

The CI (Continuous Integration) systems make sure that every pull request is tested on Windows, Linux, and macOS.
The CI must pass on all commits before merge to avoid unrelated CI failures on new pull requests.

### Manual Quality Assurance (QA) Testing

Changes should be tested by somebody other than the developer who wrote the
code. This is especially important for large or high-risk changes. It is useful
to add a test plan to the pull request description if testing the changes is
not straightforward.

Translations
------------

Changes to translations as well as new translations can be submitted to
[Bitcoin Core's Transifex page](https://explore.transifex.com/bitcoin/bitcoin/).

Translations are periodically pulled from Transifex and merged into the git repository. See the
[translation process](doc/translation_process.md) for details on how this works.

**Important**: We do not accept translation changes as GitHub pull requests because the next
pull from Transifex would automatically overwrite them again.
