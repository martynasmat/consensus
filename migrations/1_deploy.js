const MarketFactory = artifacts.require("MarketFactory");

module.exports = async function (deployer) {
  await deployer.deploy(MarketFactory);
};
