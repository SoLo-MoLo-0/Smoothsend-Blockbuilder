// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../contracts/BlockBuilder.sol";

contract BlockBuilderTest is Test {
    BlockBuilder public game;

    address public owner = address(0xAA11);
    uint256 public signerPrivateKey = 0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d;
    address public signerAddress = 0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1;

    address public player1 = address(0xB1);
    address public player2 = address(0xB2);

    uint256 public launchDay = 20000; // block.timestamp / 1 days base

    bytes32 public constant RUN_TYPEHASH = keccak256(
        "Run(address player,uint256 day,uint32 score,uint16 lines,uint8 epochs,bytes32 logHash,uint256 deadline)"
    );

    function setUp() public {
        // Warp to launch day
        vm.warp(launchDay * 1 days + 12 hours);

        game = new BlockBuilder(owner, signerAddress, launchDay);
    }

    function _signRun(
        address player,
        uint256 day,
        uint32 score,
        uint16 lines,
        uint8 epochs,
        bytes32 logHash,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                RUN_TYPEHASH,
                player,
                day,
                score,
                lines,
                epochs,
                logHash,
                deadline
            )
        );

        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Block Builder"),
                keccak256("1"),
                block.chainid,
                address(game)
            )
        );

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, structHash)
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPrivateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    // --- Required Test 1: Submit signed by signer is stored ---
    function test_submitRun_valid() public {
        uint256 day = 1;
        uint32 score = 45000;
        uint16 lines = 36;
        uint8 epochs = 2;
        bytes32 logHash = keccak256("sample-log");
        uint256 deadline = block.timestamp + 10 minutes;

        bytes memory sig = _signRun(player1, day, score, lines, epochs, logHash, deadline);

        vm.prank(player1);
        vm.expectEmit(true, true, false, true);
        emit BlockBuilder.RunSubmitted(day, player1, score, lines, logHash);
        game.submitRun(day, score, lines, epochs, logHash, deadline, sig);

        (uint32 rScore, uint16 rLines, uint8 rEpochs, bytes32 rLogHash, uint40 rSubAt) = game.runs(day, player1);
        assertEq(rScore, score);
        assertEq(rLines, lines);
        assertEq(rEpochs, epochs);
        assertEq(rLogHash, logHash);
        assertEq(rSubAt, uint40(block.timestamp));

        assertEq(game.bestScore(player1), score);

        (uint16 currentStreak, uint16 bestStreak, uint32 lastDay) = game.streaks(player1);
        assertEq(currentStreak, 1);
        assertEq(bestStreak, 1);
        assertEq(lastDay, 1);
    }

    // --- Required Test 2: Same signature from different address rejected ---
    function test_submitRun_rejectsDifferentSender() public {
        uint256 day = 1;
        uint32 score = 45000;
        uint16 lines = 36;
        uint8 epochs = 2;
        bytes32 logHash = keccak256("sample-log");
        uint256 deadline = block.timestamp + 10 minutes;

        // Signed for player1
        bytes memory sig = _signRun(player1, day, score, lines, epochs, logHash, deadline);

        // Submitted by player2
        vm.prank(player2);
        vm.expectRevert("Invalid signature");
        game.submitRun(day, score, lines, epochs, logHash, deadline, sig);
    }

    // --- Required Test 3: Second submit for same day and player rejected ---
    function test_submitRun_rejectsDuplicateSameDay() public {
        uint256 day = 1;
        uint32 score = 45000;
        uint16 lines = 36;
        uint8 epochs = 2;
        bytes32 logHash = keccak256("sample-log");
        uint256 deadline = block.timestamp + 10 minutes;

        bytes memory sig = _signRun(player1, day, score, lines, epochs, logHash, deadline);

        vm.prank(player1);
        game.submitRun(day, score, lines, epochs, logHash, deadline, sig);

        // Second attempt
        vm.prank(player1);
        vm.expectRevert("Already submitted today");
        game.submitRun(day, score, lines, epochs, logHash, deadline, sig);
    }

    // --- Required Test 4: commitDays and setSigner reject non-owners ---
    function test_admin_rejectsNonOwner() public {
        bytes32[] memory commits = new bytes32[](2);
        commits[0] = keccak256("seed2");
        commits[1] = keccak256("seed3");

        vm.prank(player1);
        vm.expectRevert();
        game.commitDays(2, commits);

        vm.prank(player1);
        vm.expectRevert();
        game.setSigner(address(0x1234));

        // Owner succeeds
        vm.prank(owner);
        game.commitDays(2, commits);
        assertEq(game.dayCommit(2), commits[0]);
        assertEq(game.dayCommit(3), commits[1]);

        vm.prank(owner);
        game.setSigner(address(0x9999));
        assertEq(game.signer(), address(0x9999));
    }

    // --- Required Test 5: Fixture signed by lib/signer.ts accepted by contract ---
    function test_fixture_signedByTypeScriptSigner() public {
        // Deploy fixture contract with the exact address and chainId used in test/signer.test.ts
        // verifyingContract = 0x1111111111111111111111111111111111111111
        // chainId = 43113
        address fixtureContractAddr = address(0x1111111111111111111111111111111111111111);
        vm.chainId(43113);

        BlockBuilder fixtureGame = new BlockBuilder(owner, signerAddress, launchDay);
        // Code deployed to fixture address
        vm.etch(fixtureContractAddr, address(fixtureGame).code);
        // Set storage: slot 2 (_owner), slot 3 (signer)
        vm.store(fixtureContractAddr, bytes32(uint256(2)), bytes32(uint256(uint160(owner))));
        vm.store(fixtureContractAddr, bytes32(uint256(3)), bytes32(uint256(uint160(signerAddress))));

        BlockBuilder testTarget = BlockBuilder(fixtureContractAddr);

        // Fixture values from test/signer.test.ts:
        address player = address(0x2222222222222222222222222222222222222222);
        uint256 day = 1;
        uint32 score = 48200;
        uint16 lines = 38;
        uint8 epochs = 3;
        bytes32 logHash = 0xe97570d5852c7d8e5a571a4e5302ae35375a333be0b9e7bbe660316df522a58c;
        uint256 deadline = 1800000000;
        bytes memory sig = hex"6cb40334d18dade9600e03d4b96d86f44fcc9ab5d6d41a4315e9ec3dfadb60820091c5c69c3ec9c11bb18683c1575962bf7d258e0428efae50796a2dd4efbc681c";

        vm.prank(player);
        testTarget.submitRun(day, score, lines, epochs, logHash, deadline, sig);

        (uint32 savedScore,,,,) = testTarget.runs(day, player);
        assertEq(savedScore, score);
    }

    // --- Optional Test: bestScore updates only upward ---
    function test_bestScore_updatesOnlyUpward() public {
        // Day 1: score 50000
        bytes memory sig1 = _signRun(player1, 1, 50000, 40, 3, keccak256("l1"), block.timestamp + 10 minutes);
        vm.prank(player1);
        game.submitRun(1, 50000, 40, 3, keccak256("l1"), block.timestamp + 10 minutes, sig1);
        assertEq(game.bestScore(player1), 50000);

        // Advance to Day 2: score 30000 (lower)
        vm.warp(block.timestamp + 1 days);
        bytes memory sig2 = _signRun(player1, 2, 30000, 25, 1, keccak256("l2"), block.timestamp + 10 minutes);
        vm.prank(player1);
        game.submitRun(2, 30000, 25, 1, keccak256("l2"), block.timestamp + 10 minutes, sig2);
        assertEq(game.bestScore(player1), 50000); // Remains 50000

        // Advance to Day 3: score 60000 (higher)
        vm.warp(block.timestamp + 1 days);
        bytes memory sig3 = _signRun(player1, 3, 60000, 45, 4, keccak256("l3"), block.timestamp + 10 minutes);
        vm.prank(player1);
        game.submitRun(3, 60000, 45, 4, keccak256("l3"), block.timestamp + 10 minutes, sig3);
        assertEq(game.bestScore(player1), 60000); // Updated to 60000
    }

    // --- Optional Test: revealDay checks ---
    function test_revealDay() public {
        uint256 day = 2;
        uint256 seed = 123456789;
        bytes32 salt = keccak256("secret_salt");
        bytes32 commitHash = keccak256(abi.encode(day, seed, salt));

        bytes32[] memory commits = new bytes32[](1);
        commits[0] = commitHash;

        vm.prank(owner);
        game.commitDays(day, commits);

        // Reverts if future day
        vm.expectRevert("Cannot reveal future day");
        game.revealDay(day, seed, salt);

        // Warp to Day 2 (callable from start of day!)
        vm.warp(block.timestamp + 1 days);

        // Reverts with invalid preimage
        vm.expectRevert("Invalid reveal preimage");
        game.revealDay(day, seed + 1, salt);

        // Succeeds at day start
        vm.expectEmit(true, false, false, true);
        emit BlockBuilder.DayRevealed(day, seed);
        game.revealDay(day, seed, salt);

        assertTrue(game.dayRevealed(day));
        assertEq(game.daySeed(day), seed);

        // Reverts if already revealed
        vm.expectRevert("Day already revealed");
        game.revealDay(day, seed, salt);
    }

    // --- Streak tests: consecutive days increment, gap resets ---
    function test_streak_consecutiveAndReset() public {
        // Day 1
        bytes memory sig1 = _signRun(player1, 1, 1000, 1, 0, keccak256("d1"), block.timestamp + 10 minutes);
        vm.prank(player1);
        game.submitRun(1, 1000, 1, 0, keccak256("d1"), block.timestamp + 10 minutes, sig1);
        (uint16 cur1, uint16 best1,) = game.streaks(player1);
        assertEq(cur1, 1);
        assertEq(best1, 1);

        // Day 2 (consecutive -> streak = 2)
        vm.warp(block.timestamp + 1 days);
        bytes memory sig2 = _signRun(player1, 2, 2000, 2, 0, keccak256("d2"), block.timestamp + 10 minutes);
        vm.prank(player1);
        game.submitRun(2, 2000, 2, 0, keccak256("d2"), block.timestamp + 10 minutes, sig2);
        (uint16 cur2, uint16 best2,) = game.streaks(player1);
        assertEq(cur2, 2);
        assertEq(best2, 2);

        // Skip to Day 4 (gap -> streak resets to 1, best remains 2)
        vm.warp(block.timestamp + 2 days);
        bytes memory sig4 = _signRun(player1, 4, 3000, 3, 0, keccak256("d4"), block.timestamp + 10 minutes);
        vm.prank(player1);
        game.submitRun(4, 3000, 3, 0, keccak256("d4"), block.timestamp + 10 minutes, sig4);
        (uint16 cur4, uint16 best4,) = game.streaks(player1);
        assertEq(cur4, 1);
        assertEq(best4, 2);
    }
}
