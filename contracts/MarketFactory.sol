// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PredictionMarket.sol";

contract MarketFactory {
    address public owner;
    mapping(address => bool) public approvedCreator;
    address[] public markets;

    event CreatorApprovalChanged(address indexed creator, bool approved);
    event MarketCreated(
        address indexed market,
        address indexed creator,
        address indexed resolver,
        address feeRecipient,
        bytes32 questionId,
        string question,
        uint256 closeTime
    );

    error NotOwner();
    error NotApprovedCreator();
    error ZeroAddress();
    error EmptyQuestion();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
        approvedCreator[msg.sender] = true;
    }

    function setApprovedCreator(address creator, bool approved) external onlyOwner {
        if (creator == address(0)) revert ZeroAddress();
        approvedCreator[creator] = approved;
        emit CreatorApprovalChanged(creator, approved);
    }

    function createMarket(string calldata question, uint256 closeTime, address resolver)
        external
        returns (address market)
    {
        if (!approvedCreator[msg.sender]) revert NotApprovedCreator();
        if (resolver == address(0)) revert ZeroAddress();
        if (bytes(question).length == 0) revert EmptyQuestion();
        require(closeTime > block.timestamp, "closeTime<=now");

        PredictionMarket m = new PredictionMarket(question, closeTime, resolver, owner);
        market = address(m);

        markets.push(market);
        bytes32 questionId = keccak256(bytes(question));
        emit MarketCreated(market, msg.sender, resolver, owner, questionId, question, closeTime);
    }

    function marketsCount() external view returns (uint256) {
        return markets.length;
    }
}
