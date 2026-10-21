// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./DailyBoard.sol";

contract BlockBuilder is DailyBoard {
    struct Run {
        uint32 score;
        uint16 lines;
        uint8 epochs;
        bytes32 logHash;
        uint40 submittedAt;
    }

    bytes32 public constant RUN_TYPEHASH = keccak256(
        "Run(address player,uint256 day,uint32 score,uint16 lines,uint8 epochs,bytes32 logHash,uint256 deadline)"
    );

    mapping(uint256 => mapping(address => Run)) public runs;
    mapping(address => uint32) public bestScore;
    mapping(uint256 => uint256) public daySeed;

    event RunSubmitted(
        uint256 indexed day,
        address indexed player,
        uint32 score,
        uint16 lines,
        bytes32 logHash
    );

    event DayRevealed(uint256 indexed day, uint256 seed);

    constructor(
        address _initialOwner,
        address _initialSigner,
        uint256 _launchDay
    ) DailyBoard(_initialOwner, _initialSigner, _launchDay) {}

    function submitRun(
        uint256 day,
        uint32 score,
        uint16 lines,
        uint8 epochs,
        bytes32 logHash,
        uint256 deadline,
        bytes calldata sig
    ) external {
        require(block.timestamp <= deadline, "Signature expired");
        _checkDay(day);
        require(runs[day][msg.sender].submittedAt == 0, "Already submitted today");

        bytes32 structHash = keccak256(
            abi.encode(
                RUN_TYPEHASH,
                msg.sender,
                day,
                score,
                lines,
                epochs,
                logHash,
                deadline
            )
        );
        _verify(structHash, sig);

        runs[day][msg.sender] = Run({
            score: score,
            lines: lines,
            epochs: epochs,
            logHash: logHash,
            submittedAt: uint40(block.timestamp)
        });

        if (score > bestScore[msg.sender]) {
            bestScore[msg.sender] = score;
        }

        _bumpStreak(msg.sender, day);

        emit RunSubmitted(day, msg.sender, score, lines, logHash);
    }

    function revealDay(uint256 day, uint256 seed, bytes32 salt) external {
        require(day <= currentDay(), "Cannot reveal future day");
        require(!dayRevealed[day], "Day already revealed");

        bytes32 expected = dayCommit[day];
        require(expected != bytes32(0), "Day not committed");
        require(keccak256(abi.encode(day, seed, salt)) == expected, "Invalid reveal preimage");

        dayRevealed[day] = true;
        daySeed[day] = seed;

        emit DayRevealed(day, seed);
    }
}
