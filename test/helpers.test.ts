import { expect } from "chai";

import { ethToWei } from "./helpers";

describe(ethToWei.name, () => {
  it("converts eth to gwei", () => {
    expect(ethToWei(1)).to.equal(String(1_000_000_000_000_000_000));
    expect(ethToWei(0.0002)).to.equal(String(200_000_000_000_000));
  });
});
