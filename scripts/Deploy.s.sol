// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/BlockBuilder.sol";

contract DeployScript is Script {
    function run() external returns (address) {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Signer key or fallback to deployer
        address signer;
        try vm.envUint("SIGNER_KEY") returns (uint256 signerKey) {
            signer = vm.addr(signerKey);
        } catch {
            signer = deployer;
        }

        // Launch day: defaults to current UTC day index if not set
        uint256 launchDay = vm.envOr("LAUNCH_DAY_INDEX", block.timestamp / 1 days);

        console.log("=== Block Builder Deployment ===");
        console.log("Deployer / Owner :", deployer);
        console.log("Signer           :", signer);
        console.log("Launch Day Index :", launchDay);
        console.log("Chain ID         :", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        BlockBuilder game = new BlockBuilder(deployer, signer, launchDay);

        // Commit Day 1 and Day 2 initial test seeds if not already active
        uint256 currentDay = game.currentDay();
        if (currentDay == 0) {
            bytes32[] memory initialCommits = new bytes32[](3);
            // Seeds for day 1, 2, 3
            initialCommits[0] = keccak256(abi.encode(1, uint256(20261010), keccak256("salt_day_1")));
            initialCommits[1] = keccak256(abi.encode(2, uint256(20261011), keccak256("salt_day_2")));
            initialCommits[2] = keccak256(abi.encode(3, uint256(20261012), keccak256("salt_day_3")));

            game.commitDays(1, initialCommits);
            console.log("Committed initial days 1..3");
        }

        vm.stopBroadcast();

        console.log(">>> BlockBuilder deployed at:", address(game));
        console.log("Update .env with: NEXT_PUBLIC_CONTRACT_ADDRESS=%s", address(game));

        return address(game);
    }
}
