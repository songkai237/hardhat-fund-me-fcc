const { deployments, ethers, getNamedAccounts, network } = require("hardhat");
const { assert, expect } = require("chai");
const { developmentChains } = require("../../helper-hardhat-config");
// const { describe, it, beforeEach } = require("node:test");

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("FundMe", async function () {
      let fundMe;
      let deployer;
      let mockV3Aggregator;
      const sendValue = ethers.utils.parseEther("1"); // 1 ETH

      beforeEach(async () => {
        deployer = (await getNamedAccounts()).deployer;
        await deployments.fixture(["all"]);
        fundMe = await ethers.getContract("FundMe", deployer);
        mockV3Aggregator = await ethers.getContract(
          "MockV3Aggregator",
          deployer
        );
      });

      describe("constructor", async function () {
        it("sets the aggregator address correctly", async function () {
          const response = await fundMe.getPriceFeed();
          assert.equal(response, mockV3Aggregator.address);
        });
      });

      describe("fund", async function () {
        it("Fails if you don't send enough ETH", async function () {
          await expect(fundMe.fund()).to.be.revertedWith(
            "You need to spend more ETH!"
          );
        });
        it("updated the amount funded data structure", async function () {
          await fundMe.fund({ value: sendValue });
          const response = await fundMe.getAddressToAmountFunded(deployer);
          assert.equal(response.toString(), sendValue.toString());
        });
        it("Adds funder to array of funders", async function () {
          await fundMe.fund({ value: sendValue });
          const funder = await fundMe.getFunder(0);
          assert.equal(funder, deployer);
        });
      });

      describe("withdraw", async function () {
        beforeEach(async function () {
          await fundMe.fund({ value: sendValue });
        });

        it("Withdraw ETH from a singo founder", async function () {
          const startContractBalance = await fundMe.provider.getBalance(
            fundMe.address
          );
          const startDeployerBalance = await fundMe.provider.getBalance(
            deployer
          );

          const txResponse = await fundMe.withdraw();
          const txReceipt = await txResponse.wait(1);

          const { gasUsed, effectiveGasPrice } = txReceipt;
          const gasCost = gasUsed.mul(effectiveGasPrice);

          const endContractBalance = await fundMe.provider.getBalance(
            fundMe.address
          );
          const endDeployerBalance = await fundMe.provider.getBalance(deployer);

          assert.equal(endContractBalance, 0);
          assert.equal(
            endDeployerBalance.add(gasCost).toString(),
            startContractBalance.add(startDeployerBalance).toString()
          );
        });

        it("Allows us to withdraw with multiple funders", async function () {
          const accounts = await ethers.getSigners();
          for (let i = 0; i < 6; i++) {
            const fundMeConnectContract = await fundMe.connect(accounts[i]);
            await fundMeConnectContract.fund({ value: sendValue });
          }

          const startContractBalance = await fundMe.provider.getBalance(
            fundMe.address
          );
          const startDeployerBalance = await fundMe.provider.getBalance(
            deployer
          );

          const txResponse = await fundMe.withdraw();
          const txReceipt = await txResponse.wait(1);

          const { gasUsed, effectiveGasPrice } = txReceipt;
          const gasCost = gasUsed.mul(effectiveGasPrice);

          const endContractBalance = await fundMe.provider.getBalance(
            fundMe.address
          );
          const endDeployerBalance = await fundMe.provider.getBalance(deployer);

          assert.equal(endContractBalance, 0);
          assert.equal(
            endDeployerBalance.add(gasCost).toString(),
            startContractBalance.add(startDeployerBalance).toString()
          );

          await expect(fundMe.getFunder(0)).to.be.reverted;
          for (let i = 0; i < 6; i++) {
            assert.equal(
              await fundMe.getAddressToAmountFunded(accounts[i].address),
              0
            );
          }
        });

        it("Only allows ths owner to withdraw", async function () {
          const accounts = await ethers.getSigners();
          const attacker = accounts[1];
          const attackerConnectedContract = await fundMe.connect(attacker);
          await expect(attackerConnectedContract.withdraw()).to.be.revertedWith(
            "FundMe__NotOwner"
          );
        });
      });
    });
