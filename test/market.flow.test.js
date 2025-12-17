const MarketFactory = artifacts.require("MarketFactory");
const PredictionMarket = artifacts.require("PredictionMarket");

const toBN = (x) => web3.utils.toBN(x);
const toWei = (s) => web3.utils.toWei(s, "ether");

// ---------- Helpers ----------
function rpc(method, params = []) {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      { jsonrpc: "2.0", method, params, id: Date.now() },
      (err, res) => (err ? reject(err) : resolve(res))
    );
  });
}

async function latestTimestamp() {
  const b = await web3.eth.getBlock("latest");
  return Number(b.timestamp);
}

async function increaseTime(seconds) {
  await rpc("evm_increaseTime", [seconds]);
  await rpc("evm_mine");
}

async function expectRevert(promise) {
  try {
    await promise;
    assert.fail("Expected revert, but tx succeeded");
  } catch (e) {
    // Ganache/Truffle often shows "revert" or "VM Exception..."
    assert(
      e.message.includes("revert") || e.message.includes("VM Exception"),
      `Expected revert, got: ${e.message}`
    );
  }
}

// ---------- Tests ----------
contract("Consensus PredictionMarket (separate tests)", (accounts) => {
  const owner = accounts[0];
  const creator = accounts[1];
  const traderA = accounts[2];
  const traderB = accounts[3];
  const resolver = accounts[0];

  let factory;

  // Deploy a fresh factory for each test (keeps tests isolated)
  beforeEach(async () => {
    factory = await MarketFactory.new({ from: owner });
  });

  describe("Factory allowlist", () => {
    it("rejects unapproved creator", async () => {
      const question = "Will ETH go up tomorrow?";
      const closeTime = (await latestTimestamp()) + 30;

      await expectRevert(
        factory.createMarket(question, closeTime, resolver, { from: creator })
      );
    });

    it("owner can approve creator", async () => {
      await factory.setApprovedCreator(creator, true, { from: owner });
      const approved = await factory.approvedCreator(creator);
      assert.equal(approved, true, "creator should be approved");
    });

    it("approved creator can create market and MarketCreated emits", async () => {
      await factory.setApprovedCreator(creator, true, { from: owner });

      const question = "Market create event test";
      const closeTime = (await latestTimestamp()) + 30;

      const tx = await factory.createMarket(question, closeTime, resolver, { from: creator });

      const created = tx.logs.find((l) => l.event === "MarketCreated");
      assert.ok(created, "MarketCreated event not found");
      assert.ok(created.args.market, "market address missing in event");

      const market = await PredictionMarket.at(created.args.market);
      const storedResolver = await market.resolver();
      assert.equal(storedResolver, resolver, "resolver mismatch");
      const storedQuestion = await market.question();
      assert.equal(storedQuestion, question, "question mismatch");
      const storedQuestionId = await market.questionId();
      assert.equal(storedQuestionId, web3.utils.keccak256(question), "questionId mismatch");
    });
  });

  describe("Market lifecycle (with fees)", () => {
    async function setupMarket({ closeIn = 30 } = {}) {
      await factory.setApprovedCreator(creator, true, { from: owner });

      const question = "Lifecycle test market";
      const closeTime = (await latestTimestamp()) + closeIn;

      const tx = await factory.createMarket(question, closeTime, resolver, { from: creator });
      const marketAddr = tx.logs.find((l) => l.event === "MarketCreated").args.market;

      const market = await PredictionMarket.at(marketAddr);
      return { market, closeTime };
    }

    it("allows staking and contract balance becomes 3 ETH after two stakes", async () => {
      const { market } = await setupMarket({ closeIn: 60 });

      await market.stakeYesSide({ from: traderA, value: toWei("1") });
      await market.stakeNoSide({ from: traderB, value: toWei("2") });

      const bal = toBN(await web3.eth.getBalance(market.address));
      assert.equal(bal.toString(), toBN(toWei("3")).toString(), "contract should hold 3 ETH");
    });

    it("rejects resolve before closeTime", async () => {
      const { market } = await setupMarket({ closeIn: 60 });
      await expectRevert(market.resolve(1, { from: resolver })); // 1=Yes
    });

    it("rejects resolve from non-resolver", async () => {
      const { market } = await setupMarket({ closeIn: 5 });
      await increaseTime(10);

      await expectRevert(market.resolve(1, { from: traderA }));
    });

    it("resolves after closeTime and outcome is stored", async () => {
      const { market } = await setupMarket({ closeIn: 5 });
      await increaseTime(10);

      await market.resolve(1, { from: resolver });
      const out = await market.outcome();
      assert.equal(out.toString(), "1", "outcome should be YES");
    });

    it("redeem drains pool and leaves only fees (0.015 ETH) in contract", async () => {
      const { market } = await setupMarket({ closeIn: 5 });

      await market.stakeYesSide({ from: traderA, value: toWei("1") });
      await market.stakeNoSide({ from: traderB, value: toWei("2") });

      await increaseTime(10);
      await market.resolve(1, { from: resolver });

      await market.redeem({ from: traderA });
      await market.redeem({ from: traderB });

      const fees = toBN(await market.feesAccrued());
      const expectedFees = toBN(toWei("0.015")); // 0.5% of 1 + 2 ETH = 0.015 ETH
      assert.equal(fees.toString(), expectedFees.toString(), "feesAccrued mismatch");

      const bal = toBN(await web3.eth.getBalance(market.address));
      assert.equal(bal.toString(), expectedFees.toString(), "contract should retain only fees");
    });

    it("feeRecipient can withdraw fees and feesAccrued resets to 0", async () => {
      const { market } = await setupMarket({ closeIn: 5 });

      await market.stakeYesSide({ from: traderA, value: toWei("1") });
      await market.stakeNoSide({ from: traderB, value: toWei("2") });

      await increaseTime(10);
      await market.resolve(1, { from: resolver });

      await market.redeem({ from: traderA });
      await market.redeem({ from: traderB });

      const feeRecipient = await market.feeRecipient();
      await market.withdrawFees({ from: feeRecipient });

      const bal = toBN(await web3.eth.getBalance(market.address));
      assert.equal(bal.toString(), "0", "contract should be empty after fee withdraw");

      const feesAfter = toBN(await market.feesAccrued());
      assert.equal(feesAfter.toString(), "0", "feesAccrued should be 0");
    });

    it("cannot redeem twice", async () => {
      const { market } = await setupMarket({ closeIn: 5 });

      await market.stakeYesSide({ from: traderA, value: toWei("1") });

      await increaseTime(10);
      await market.resolve(1, { from: resolver });

      await market.redeem({ from: traderA });
      await expectRevert(market.redeem({ from: traderA }));
    });
  });
});
