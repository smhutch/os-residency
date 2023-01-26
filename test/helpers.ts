import { BigNumber, BigNumberish } from "ethers";
import { ethers } from "hardhat";
import { AddressLike, toAddress } from "hardhat-helpers";
import web3 from "web3";

export const ethToWei = (eth: number): string => {
  return web3.utils.toWei(eth.toString(), "ether");
};

export const setETHBalance = async (account: AddressLike, newBalance: BigNumberish) => {
  let balance = ethers.utils.hexStripZeros(BigNumber.from(newBalance).toHexString());
  if (balance == "0x") {
    // When setting to 0, hexStripZeros returns 0x which would fail
    balance = "0x0";
  }

  await ethers.provider.send("hardhat_setBalance", [toAddress(account), balance]);
};
