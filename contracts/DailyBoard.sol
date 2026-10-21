// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract DailyBoard is EIP712, Ownable {
    address public signer;
    uint256 public immutable launchDay; // UTC day index of day 1
    mapping(uint256 => bytes32) public dayCommit; // day => commitment hash
    mapping(uint256 => bool) public dayRevealed;

    struct Streak {
        uint16 current;
        uint16 best;
        uint32 lastDay;
    }
    mapping(address => Streak) public streaks;

    event SignerUpdated(address indexed newSigner);
    event DaysCommitted(uint256 indexed firstDay, uint256 count);

    constructor(
        address _initialOwner,
        address _initialSigner,
        uint256 _launchDay
    ) EIP712("Block Builder", "1") Ownable(_initialOwner) {
        require(_initialOwner != address(0), "Owner cannot be zero");
        require(_initialSigner != address(0), "Signer cannot be zero");
        signer = _initialSigner;
        launchDay = _launchDay;
    }

    /// @notice 0 before launch, else 1-based day index
    function currentDay() public view virtual returns (uint256) {
        uint256 todayUtc = block.timestamp / 1 days;
        if (todayUtc < launchDay) {
            return 0;
        }
        return todayUtc - launchDay + 1;
    }

    /// @notice Day must be current or current - 1 (1-day grace period around UTC midnight)
    function _checkDay(uint256 day) internal view virtual {
        uint256 cur = currentDay();
        require(cur > 0, "Game not launched");
        require(day == cur || (cur > 1 && day == cur - 1), "Day not eligible");
    }

    /// @notice Verify EIP-712 struct hash signed by authorized signer
    function _verify(bytes32 structHash, bytes calldata sig) internal view virtual {
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = ECDSA.recover(digest, sig);
        require(recovered == signer && signer != address(0), "Invalid signature");
    }

    /// @notice Bump streak: +1 if day == lastDay + 1, else 1
    function _bumpStreak(address player, uint256 day) internal virtual {
        Streak storage s = streaks[player];
        if (day == s.lastDay) {
            return;
        }
        if (s.lastDay != 0 && day == s.lastDay + 1) {
            s.current += 1;
        } else {
            s.current = 1;
        }
        if (s.current > s.best) {
            s.best = s.current;
        }
        s.lastDay = uint32(day);
    }

    /// @notice Commit future day hashes. Never overwrites existing commits.
    function commitDays(uint256 firstDay, bytes32[] calldata hashes) external onlyOwner {
        uint256 cur = currentDay();
        require(firstDay > cur, "Only future days");
        for (uint256 i = 0; i < hashes.length; i++) {
            uint256 d = firstDay + i;
            require(dayCommit[d] == bytes32(0), "Day already committed");
            dayCommit[d] = hashes[i];
        }
        emit DaysCommitted(firstDay, hashes.length);
    }

    /// @notice Update backend EIP-712 signer
    function setSigner(address s) external onlyOwner {
        require(s != address(0), "Signer cannot be zero");
        signer = s;
        emit SignerUpdated(s);
    }
}
