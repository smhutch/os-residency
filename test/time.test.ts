import { expect } from "chai";

import { daysInSeconds, hoursInSeconds } from "./time";

describe(hoursInSeconds.name, () => {
  it("converts hours to seconds", () => {
    expect(hoursInSeconds(1)).to.equal(3600);
    expect(hoursInSeconds(0.2)).to.equal(720);
  });
});

describe(daysInSeconds.name, () => {
  it("converts days to seconds", () => {
    expect(daysInSeconds(1)).to.equal(86_400);
    expect(daysInSeconds(7)).to.equal(604_800);
  });
});
