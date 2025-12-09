// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PredictionMarket.sol";

contract MarketFactory {
    address public owner;

    // Only allow select users to create markets
    mapping(address => bool) public approvedCreator;

    address[] public markets;

    event CreatorApprovalChanged(address indexed creator, bool approved);

    event MarketCreated(
        address indexed market,
        address indexed creator,
        address indexed resolver,
        bytes32 questionId,
        uint256 closeTime
    );

    error NotOwner();
    error NotApprovedCreator();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
        approvedCreator[msg.sender] = true;
    }

    // Approve or revoke a creator
    function setApprovedCreator(address creator, bool approved) external onlyOwner {
        if (creator == address(0)) revert ZeroAddress();
        approvedCreator[creator] = approved;
        emit CreatorApprovalChanged(creator, approved);
    }

    function createMarket(bytes32 questionId, uint256 closeTime, address resolver)
        external
        returns (address market)
    {
        if (!approvedCreator[msg.sender]) revert NotApprovedCreator();
        
        if (resolver == address(0)) revert ZeroAddress();
        require(closeTime > block.timestamp, "closeTime<=now");

        PredictionMarket m = new PredictionMarket(questionId, closeTime, resolver);
        market = address(m);

        markets.push(market);
        emit MarketCreated(market, msg.sender, resolver, questionId, closeTime);
    }

    function marketsCount() external view returns (uint256) {
        return markets.length;
    }
}
