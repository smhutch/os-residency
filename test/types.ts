import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import type { Party } from "../types/Party";

type Fixture<T> = () => Promise<T>;

declare module "mocha" {
  export interface Context {
    party: Party;
    loadFixture: <T>(fixture: Fixture<T>) => Promise<T>;
    signers: Signers;
  }
}

export interface Signers {
  admin: SignerWithAddress;
  host: SignerWithAddress;
}
