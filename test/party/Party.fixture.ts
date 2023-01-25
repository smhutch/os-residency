import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";

import type { Party } from "../../types/Party";
import type { Party__factory } from "../../types/factories/Party__factory";

export async function deployPartyFixture(): Promise<{ party: Party }> {
  const signers: SignerWithAddress[] = await ethers.getSigners();
  const admin: SignerWithAddress = signers[0];

  const partyFactory = <Party__factory>await ethers.getContractFactory("Party");

  const party = <Party>await partyFactory.connect(admin).deploy();
  await party.deployed();

  return { party };
}
