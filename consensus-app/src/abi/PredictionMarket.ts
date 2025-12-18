export const PredictionMarketABI = [
    "function questionId() view returns (bytes32)",
    "function question() view returns (string)",
    "function closeTime() view returns (uint256)",
    "function resolver() view returns (address)",
    "function outcome() view returns (uint8)", // 0 Unresolved, 1 Yes, 2 No

    "function totalYes() view returns (uint256)",
    "function totalNo() view returns (uint256)",
    "function stakeYes(address) view returns (uint256)",
    "function stakeNo(address) view returns (uint256)",
    "function claimed(address) view returns (bool)",

    "function stakeYesSide() payable",
    "function stakeNoSide() payable",
    "function resolve(uint8 outcome)",
    "function redeem()",

    "function feesAccrued() view returns (uint256)",
    "function feeRecipient() view returns (address)",
    "function withdrawFees()",
    "event Staked(address indexed trader, uint8 indexed side, uint256 grossAmount, uint256 fee, uint256 netAmount)",
    "event Resolved(uint8 indexed outcome)",
    "event FeesWithdrawn(address indexed to, uint256 amount)",
    "event Redeemed(address indexed trader, uint256 payout)",
];
