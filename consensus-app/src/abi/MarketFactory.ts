export const MarketFactoryABI = [
    "function owner() view returns (address)",
    "function approvedCreator(address) view returns (bool)",
    "function setApprovedCreator(address creator, bool approved)",
    "function createMarket(bytes32 questionId, uint256 closeTime, address resolver) returns (address)",
    "function marketsCount() view returns (uint256)",
    "function markets(uint256) view returns (address)",
    "event MarketCreated(address indexed market, address indexed creator, address indexed resolver, bytes32 questionId, uint256 closeTime)",
];