import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { BigNumber, ContractReceipt, Wallet } from "ethers";
import { ethers } from "hardhat";
import { ONE_HOUR, getRandomSigner, setETHBalance } from "hardhat-helpers";

import { Party } from "../../types/Party";
import { ethToWei } from "../helpers";
import { daysInSeconds, hoursInSeconds, nowInSeconds } from "../time";
import type { Signers } from "../types";
import { deployPartyFixture } from "./Party.fixture";

type CreateEventArgs = Parameters<Party["createEvent"]>;

const signers = {} as Signers;

before(async function () {
  const _signers: SignerWithAddress[] = await ethers.getSigners();
  signers.admin = _signers[0];
  signers.host = _signers[1];
});

const INVALID_PARTY_ID = 999_999;
const NOT_RELEVANT = 1;

const DEFAULT_PARTY_NAME = "basic party";

describe("Party", () => {
  let party: Party;

  const setupParty = async (
    wallet: Wallet | SignerWithAddress,
    overrides: Partial<{
      eventName: CreateEventArgs[0];
      maxParticipantsCount: CreateEventArgs[1];
      rsvpPrice: CreateEventArgs[2];
      eventStartDateInSeconds: CreateEventArgs[3];
      eventDurationInSeconds: CreateEventArgs[4];
    }> = {},
  ) => {
    const { eventName, maxParticipantsCount, rsvpPrice, eventStartDateInSeconds, eventDurationInSeconds } = overrides;

    const args: CreateEventArgs = [
      eventName ?? DEFAULT_PARTY_NAME,
      maxParticipantsCount ?? 100,
      rsvpPrice ?? ethToWei(0.1),
      eventStartDateInSeconds ?? nowInSeconds() + ONE_HOUR,
      eventDurationInSeconds ?? ONE_HOUR,
    ];

    await party.connect(wallet).createEvent(...args);
  };

  beforeEach(async () => {
    const fixture = await loadFixture(deployPartyFixture);
    party = fixture.party;
  });

  describe("createEvent", () => {
    it("emits expected event", async () => {
      const eventName = "my event";
      const maxParticipantsCount = 1;
      const rsvpPrice = ethToWei(0.2);
      const startTime = Date.now();
      const duration = ONE_HOUR;

      const createEventArgs: CreateEventArgs = [eventName, maxParticipantsCount, rsvpPrice, startTime, duration];

      const tx = party.connect(signers.host).createEvent(...createEventArgs);

      const expectedEndTime = startTime + duration;

      await expect(tx)
        .to.emit(party, "EventCreated")
        .withArgs(1, signers.host.address, eventName, maxParticipantsCount, rsvpPrice, startTime, expectedEndTime);
    });

    it("increments the event ID", async () => {
      const maxParticipantsCount = 1;
      const rsvpPrice = ethToWei(0.2);
      const startTime = Date.now();
      const duration = ONE_HOUR;

      const createEventArgs: CreateEventArgs = ["event one", maxParticipantsCount, rsvpPrice, startTime, duration];

      const tx1 = party.connect(signers.host).createEvent(...createEventArgs);

      const expectedId1 = 1;
      const expectedId2 = 2;

      const expectedEndTime = startTime + duration;

      await expect(tx1)
        .to.emit(party, "EventCreated")
        .withArgs(
          expectedId1,
          signers.host.address,
          "event one",
          maxParticipantsCount,
          rsvpPrice,
          startTime,
          expectedEndTime,
        );

      const tx2 = party.connect(signers.host).createEvent(...createEventArgs);

      await expect(tx2)
        .to.emit(party, "EventCreated")
        .withArgs(
          expectedId2,
          signers.host.address,
          "event one",
          maxParticipantsCount,
          rsvpPrice,
          startTime,
          expectedEndTime,
        );
    });

    it("reverts when max participants is zero", async () => {
      const maxParticipants = 0;
      const tx = party
        .connect(signers.admin)
        .createEvent("my event", maxParticipants, NOT_RELEVANT, NOT_RELEVANT, NOT_RELEVANT + 1);

      await expect(tx).to.be.revertedWithCustomError(party, "PartyContract_Event_Must_Allow_Participants");
    });

    it("reverts when start time is in the past", async () => {
      const now = nowInSeconds();
      const startTime = now - daysInSeconds(1);
      const duration = hoursInSeconds(2);

      const tx = party.connect(signers.admin).createEvent("my event", NOT_RELEVANT, NOT_RELEVANT, startTime, duration);

      await expect(tx).to.be.revertedWithCustomError(party, "PartyContract_Event_Must_Be_In_The_Future");
    });

    it("reverts when start time is equal to end time", async () => {
      const startTime = nowInSeconds();
      const duration = 0;

      const tx = party.connect(signers.admin).createEvent("my event", NOT_RELEVANT, NOT_RELEVANT, startTime, duration);

      await expect(tx).to.be.revertedWithCustomError(party, "PartyContract_Event_Must_Have_Duration");
    });
  });

  describe("getEventMetadata", () => {
    it("returns party metadata", async () => {
      const host = signers.host;
      const user = getRandomSigner(0);

      const eventName = "my party";

      await setupParty(host, {
        eventName,
      });

      const tx = await party.connect(user).getEventMetadata(1);

      await expect(tx).not.to.be.reverted;
      expect(tx).to.deep.equal([eventName, host.address]);
    });

    it("reverts when party does not exist", async () => {
      const tx = party.connect(signers.admin).getEventMetadata(INVALID_PARTY_ID);
      await expect(tx).to.be.revertedWithCustomError(party, "PartyContract_Event_Does_Not_Exist");
    });
  });

  describe("rsvp", () => {
    let user: Wallet;

    beforeEach(async () => {
      user = await getTestUserWithEth(0);
    });

    it("supports rsvp'ing to free events", async () => {
      await setupParty(user, {
        rsvpPrice: ethToWei(0),
      });
      const tx = party.connect(user).rsvp(1, { value: 0 });
      await expect(tx).not.to.be.reverted;
      await expect(tx).to.emit(party, "AttendeeReplied").withArgs(1, user.address, 0);
    });

    it("supports rsvp'ing to paid events", async () => {
      const rsvpPrice = ethToWei(0.2);

      await setupParty(user, {
        rsvpPrice,
      });
      const tx = party.connect(user).rsvp(1, { value: rsvpPrice.toString() });
      await expect(tx).not.to.be.reverted;
      await expect(tx).to.emit(party, "AttendeeReplied").withArgs(1, user.address, rsvpPrice);
    });

    it("reverts when party does not exist", async () => {
      await expect(party.connect(user).rsvp(INVALID_PARTY_ID)).to.revertedWithCustomError(
        party,
        "PartyContract_Event_Does_Not_Exist",
      );
    });

    it("reverts when sender has already rsvp'd", async () => {
      await setupParty(user);
      const tx1 = party.connect(user).rsvp(1, { value: ethToWei(0.2) });
      await expect(tx1).not.to.be.reverted;

      const tx2 = party.connect(user).rsvp(1, { value: ethToWei(0.2) });
      await expect(tx2).to.be.revertedWithCustomError(party, "PartyContract_Already_RSVPd");
    });

    it("reverts when 0 ETH is sent to a non-free event", async () => {
      await setupParty(user, {
        rsvpPrice: ethToWei(0.4),
      });
      const tx = party.connect(user).rsvp(1, { value: 0 });
      await expect(tx).to.be.revertedWithCustomError(party, "PartyContract_Rsvp_Price_Must_Be_Set");
    });

    it("reverts when too little ETH is sent to a non-free event", async () => {
      const rsvpPrice = ethToWei(0.4);

      await setupParty(user, {
        rsvpPrice,
      });
      const tx = party.connect(user).rsvp(1, { value: ethToWei(0.2) });
      await expect(tx)
        .to.be.revertedWithCustomError(party, "PartyContract_Rsvp_Stake_Must_Be_At_Least")
        .withArgs(rsvpPrice);
    });

    it("reverts when event is full", async () => {
      const maxParticipantsCount = 1;
      const rsvpPrice = ethToWei(0.1);
      const user1 = await getTestUserWithEth(1);
      const user2 = await getTestUserWithEth(2);

      await setupParty(user, {
        rsvpPrice,
        maxParticipantsCount,
      });

      // First respondent — should work
      const tx1 = party.connect(user1).rsvp(1, { value: rsvpPrice.toString() });
      await expect(tx1).not.to.be.reverted;

      // Second respondent — should revert
      const tx2 = party.connect(user2).rsvp(1, { value: rsvpPrice.toString() });
      await expect(tx2).to.be.revertedWithCustomError(party, "PartyContract_Event_Is_Full");
    });
  });

  describe("checkIn", () => {
    let attendingUser: Wallet;
    let notAttendingUser: Wallet;
    let randomUser: Wallet;

    beforeEach(async () => {
      attendingUser = await getTestUserWithEth(0);
      notAttendingUser = await getTestUserWithEth(1);
      randomUser = await getTestUserWithEth(2);
    });

    it("reverts when party does not exist", async () => {
      await expect(party.connect(attendingUser).checkIn(INVALID_PARTY_ID)).to.revertedWithCustomError(
        party,
        "PartyContract_Event_Does_Not_Exist",
      );
    });

    describe("when event has not started", () => {
      beforeEach(async () => {
        const now = nowInSeconds();
        const startTime = now + daysInSeconds(1);

        await setupParty(signers.host, {
          eventStartDateInSeconds: startTime,
        });
      });

      it("reverts", async () => {
        const tx = party.connect(randomUser).checkIn(1);
        await expect(tx).to.be.revertedWithCustomError(party, "PartyContract_Event_Has_Not_Started");
      });
    });

    describe("when event has ended", () => {
      beforeEach(async () => {
        const now = nowInSeconds();

        // Create an event that starts in one hour, and lasts for one day
        const startTime = now + hoursInSeconds(1);
        const duration = daysInSeconds(1);
        await setupParty(signers.host, {
          eventStartDateInSeconds: startTime,
          eventDurationInSeconds: duration,
        });

        // Advance time by two days (well after the event has ended)
        await ethers.provider.send("evm_increaseTime", [daysInSeconds(2)]);
      });

      it("reverts", async () => {
        const tx = party.connect(randomUser).checkIn(1);

        await expect(tx).to.be.revertedWithCustomError(party, "PartyContract_Event_Has_Ended");
      });
    });

    describe("when event is currently in progress", () => {
      const assumedTokenId = 1;
      const paidEventRsvpCost = ethToWei(0.2);

      const composeLiveEvent = (rsvpPrice: string) => async () => {
        const now = nowInSeconds();

        // Create an event that starts in one hour, and lasts for one day
        const startTime = now + hoursInSeconds(1);
        const duration = daysInSeconds(1);
        await setupParty(signers.host, {
          eventStartDateInSeconds: startTime,
          eventDurationInSeconds: duration,
          rsvpPrice,
        });

        // Advance time by two hours (during the event interval)
        await ethers.provider.send("evm_increaseTime", [hoursInSeconds(2)]);
      };

      const setupFreeEvent = composeLiveEvent("0");
      const setupPaidEvent = composeLiveEvent(paidEventRsvpCost.toString());

      const rsvpToLiveEvent = async (options: { account: Wallet; rsvpStake: BigNumber }) => {
        const { account, rsvpStake } = options;
        await party.connect(account).rsvp(assumedTokenId, { value: rsvpStake.toString() });
      };

      const getGasCost = (receipt: ContractReceipt) => receipt.gasUsed.mul(receipt.effectiveGasPrice);

      describe("when connected user has RSVP'd to free event", () => {
        const amountStaked = 0;

        beforeEach(async () => {
          await setupFreeEvent();
          await rsvpToLiveEvent({
            account: attendingUser,
            rsvpStake: BigNumber.from(amountStaked),
          });
        });

        it("emits `ParticipantCheckedIn` event and does not change attendee balance", async () => {
          const initialBalance = await attendingUser.getBalance();

          const tx = await party.connect(attendingUser).checkIn(assumedTokenId);

          const receipt = await tx.wait();
          const gasCost = getGasCost(receipt);
          const expectedBalance = initialBalance.sub(gasCost);

          await expect(tx).to.emit(party, "ParticipantCheckedIn").withArgs(assumedTokenId, attendingUser.address);
          await expect(attendingUser.getBalance()).to.eventually.eq(expectedBalance);
        });
      });

      describe("when connected user has RSVP'd to event with rsvpPrice", () => {
        const amountStaked = paidEventRsvpCost;

        beforeEach(async () => {
          await setupPaidEvent();
          await rsvpToLiveEvent({
            account: attendingUser,
            rsvpStake: BigNumber.from(amountStaked),
          });
        });

        it("emits `ParticipantCheckedIn` event and returns stake", async () => {
          const initialBalance = await attendingUser.getBalance();

          const tx = await party.connect(attendingUser).checkIn(assumedTokenId);

          const receipt = await tx.wait();
          const gasCost = getGasCost(receipt);
          const balanceMinusGasCost = initialBalance.sub(gasCost);
          const expectedBalance = balanceMinusGasCost.add(paidEventRsvpCost);

          await expect(tx).to.emit(party, "ParticipantCheckedIn").withArgs(assumedTokenId, attendingUser.address);
          await expect(attendingUser.getBalance()).to.eventually.eq(expectedBalance);
        });
      });

      describe("when connected user has overpaid while RSVP'ing", () => {
        const amountStaked = ethToWei(1);

        beforeEach(async () => {
          await setupFreeEvent();
          await rsvpToLiveEvent({
            account: attendingUser,
            rsvpStake: BigNumber.from(amountStaked),
          });
        });

        it("emits `ParticipantCheckedIn` event and returns stake", async () => {
          const initialBalance = await attendingUser.getBalance();

          const tx = await party.connect(attendingUser).checkIn(assumedTokenId);

          const receipt = await tx.wait();
          const gasCost = getGasCost(receipt);
          const balanceMinusGasCost = initialBalance.sub(gasCost);
          const expectedBalance = balanceMinusGasCost.add(BigNumber.from(amountStaked));

          await expect(tx).to.emit(party, "ParticipantCheckedIn").withArgs(assumedTokenId, attendingUser.address);
          await expect(attendingUser.getBalance()).to.eventually.eq(expectedBalance);
        });
      });

      describe("when connected account has not rsvp'd", () => {
        beforeEach(async () => {
          await setupFreeEvent();
        });

        it("reverts", async () => {
          const tx = party.connect(notAttendingUser).checkIn(assumedTokenId);
          await expect(tx).to.be.revertedWithCustomError(party, "PartyContract_Has_Not_RSVPd");
        });
      });
    });
  });

  describe("withdrawProceeds", () => {
    it("todo");
  });
});

const getTestUserWithEth = async (index: number): Promise<Wallet> => {
  const randomUser = getRandomSigner(index);
  await setETHBalance(randomUser, ethToWei(100));
  return randomUser;
};
