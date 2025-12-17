export const PredictionMarketABI = [
    "function questionId() view returns (bytes32)",
    "function question() view returns (string)",
    "function closeTime() view returns (uint256)",
    "function resolver() view returns (address)",
    "function outcome() view returns (uint8)", // 0 Unresolved, 1 Yes, 2 No

    "function totalYes() view returns (uint256)",
    "function totalNo() view returns (uint256)",

    "function stakeYesSide() payable",
    "function stakeNoSide() payable",
    "function resolve(uint8 outcome)",
    "function redeem()",

    "function feesAccrued() view returns (uint256)",
    "function feeRecipient() view returns (address)",
    "function withdrawFees()",
];
