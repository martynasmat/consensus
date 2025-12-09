// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PredictionMarket {
    enum Outcome { Unresolved, Yes, No }

    uint16 public constant FEE_BPS = 50;      // 0.5% = 50 / 10_000
    uint16 private constant BPS_DENOM = 10_000;

    address public immutable creator;
    address public immutable resolver;
    address public immutable feeRecipient;
    uint256 public immutable closeTime;
    bytes32 public immutable questionId;

    Outcome public outcome;

    uint256 public totalYes;     // net pool amounts (fees excluded)
    uint256 public totalNo;      // net pool amounts (fees excluded)
    uint256 public feesAccrued;  // fees in ETH, withdrawable

    mapping(address => uint256) public stakeYes; // net stake
    mapping(address => uint256) public stakeNo;  // net stake
    mapping(address => bool) public claimed;

    event Staked(address indexed trader, Outcome indexed side, uint256 grossAmount, uint256 fee, uint256 netAmount);
    event Resolved(Outcome indexed outcome);
    event Redeemed(address indexed trader, uint256 payout);
    event FeesWithdrawn(address indexed to, uint256 amount);

    error MarketNotOpen();
    error MarketNotClosed();
    error AlreadyResolved();
    error NotResolver();
    error InvalidOutcome();
    error AmountZero();
    error AlreadyClaimed();
    error NothingToRedeem();
    error NotFeeRecipient();
    error ZeroAddress();

    constructor(
        bytes32 _questionId,
        uint256 _closeTime,
        address _resolver,
        address _feeRecipient
    ) {
        if (_resolver == address(0) || _feeRecipient == address(0)) revert ZeroAddress();
        require(_closeTime > block.timestamp, "closeTime<=now");

        creator = msg.sender;
        resolver = _resolver;
        feeRecipient = _feeRecipient;
        closeTime = _closeTime;
        questionId = _questionId;
        outcome = Outcome.Unresolved;
    }

    function isOpen() public view returns (bool) {
        return block.timestamp < closeTime && outcome == Outcome.Unresolved;
    }

    function stake(Outcome side) public payable {
        if (!isOpen()) revert MarketNotOpen();
        if (side != Outcome.Yes && side != Outcome.No) revert InvalidOutcome();
        if (msg.value == 0) revert AmountZero();

        uint256 fee = (msg.value * FEE_BPS) / BPS_DENOM;
        uint256 net = msg.value - fee;

        feesAccrued += fee;

        if (side == Outcome.Yes) {
            stakeYes[msg.sender] += net;
            totalYes += net;
        } else {
            stakeNo[msg.sender] += net;
            totalNo += net;
        }

        emit Staked(msg.sender, side, msg.value, fee, net);
    }

    function stakeYesSide() external payable { stake(Outcome.Yes); }
    function stakeNoSide() external payable { stake(Outcome.No); }

    function resolve(Outcome _outcome) external {
        if (block.timestamp < closeTime) revert MarketNotClosed();
        if (outcome != Outcome.Unresolved) revert AlreadyResolved();
        if (msg.sender != resolver) revert NotResolver();
        if (_outcome != Outcome.Yes && _outcome != Outcome.No) revert InvalidOutcome();

        outcome = _outcome;
        emit Resolved(_outcome);
    }

    function redeem() external {
        if (outcome == Outcome.Unresolved) revert MarketNotClosed();
        if (claimed[msg.sender]) revert AlreadyClaimed();

        uint256 userYes = stakeYes[msg.sender];
        uint256 userNo  = stakeNo[msg.sender];
        uint256 userTotal = userYes + userNo;
        if (userTotal == 0) revert NothingToRedeem();

        claimed[msg.sender] = true;

        uint256 pool = totalYes + totalNo;
        uint256 winningPool = (outcome == Outcome.Yes) ? totalYes : totalNo;

        uint256 payout;
        if (winningPool == 0) {
            payout = userTotal; // void: refund net stakes (fees still kept)
        } else {
            uint256 userWinningStake = (outcome == Outcome.Yes) ? userYes : userNo;
            payout = (userWinningStake == 0) ? 0 : (userWinningStake * pool) / winningPool;
        }

        _sendETH(msg.sender, payout);
        emit Redeemed(msg.sender, payout);
    }

    function withdrawFees() external {
        if (msg.sender != feeRecipient) revert NotFeeRecipient();

        uint256 amount = feesAccrued;
        feesAccrued = 0;

        _sendETH(msg.sender, amount);
        emit FeesWithdrawn(msg.sender, amount);
    }

    function _sendETH(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "ETH transfer failed");
    }

    receive() external payable { revert("use stake()"); }
    fallback() external payable { revert("use stake()"); }
}
