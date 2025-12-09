// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PredictionMarket {
    // Outcome type
    enum Outcome {
        Unresolved,
        Yes,
        No
    }

    // Roles
    address public immutable creator;
    address public immutable resolver;
    uint256 public immutable closeTime;
    bytes32 public immutable questionId; // Question hash

    // State (Unresolved on init)
    Outcome public outcome;

    // Total amounts staked for both outcomes
    uint256 public totalYes;
    uint256 public totalNo;

    // Amounts staked by each trader for each outcome
    mapping(address => uint256) public stakeYes;
    mapping(address => uint256) public stakeNo;

    mapping(address => bool) public claimed;

    // Events
    event Staked(address indexed trader, Outcome indexed side, uint256 amount);
    event Resolved(Outcome indexed outcome);
    event Redeemed(address indexed trader, uint256 payout);

    // Errors
    error MarketNotOpen();
    error MarketNotClosed();
    error AlreadyResolved();
    error NotResolver();
    error InvalidOutcome();
    error AmountZero();
    error AlreadyClaimed();
    error NothingToRedeem();

    constructor(bytes32 _questionId, uint256 _closeTime, address _resolver) {
        require(_resolver != address(0), "resolver=0");
        require(_closeTime > block.timestamp, "closeTime<=now");

        creator = msg.sender;
        resolver = _resolver;
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

        if (side == Outcome.Yes) {
            stakeYes[msg.sender] += msg.value;
            totalYes += msg.value;
        } else {
            stakeNo[msg.sender] += msg.value;
            totalNo += msg.value;
        }

        emit Staked(msg.sender, side, msg.value);
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

    /// Winners split the pool proportionally.
    /// If nobody staked the winning side, treat as void: everyone redeems their own total stake.
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
            payout = userTotal;
        } else {
            uint256 userWinningStake = (outcome == Outcome.Yes) ? userYes : userNo;
            payout = (userWinningStake == 0) ? 0 : (userWinningStake * pool) / winningPool;
        }

        _sendETH(msg.sender, payout);
        emit Redeemed(msg.sender, payout);
    }

    function _sendETH(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "ETH transfer failed");
    }

    receive() external payable { revert("use stake()"); }
    fallback() external payable { revert("use stake()"); }
}