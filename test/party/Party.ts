import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { Wallet } from "ethers";
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
    wallet: Wallet,
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
      eventStartDateInSeconds ?? NOT_RELEVANT,
      eventDurationInSeconds ?? ONE_HOUR,
    ];

    await party.connect(wallet).createEvent(...args);
  };

  beforeEach(async () => {
    const fixture = await loadFixture(deployPartyFixture);
    party = fixture.party;
  });

  describe.only("createEvent", () => {
    it("emits expected event", async () => {
      const eventName = "my event";
      const maxParticipantsCount = 1;
      const rsvpPrice = ethToWei(0.2);
      const startTime = Date.now();
      const duration = ONE_HOUR;

      const createEventArgs: CreateEventArgs = [eventName, maxParticipantsCount, rsvpPrice, startTime, duration];

      const tx = party.connect(signers.host).createEvent(...createEventArgs);

      await expect(tx)
        .to.emit(party, "EventCreated")
        .withArgs(1, signers.host.address, ...createEventArgs);
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

      await expect(tx1)
        .to.emit(party, "EventCreated")
        .withArgs(expectedId1, signers.host.address, ...createEventArgs);

      const tx2 = party.connect(signers.host).createEvent(...createEventArgs);

      await expect(tx2)
        .to.emit(party, "EventCreated")
        .withArgs(expectedId2, signers.host.address, ...createEventArgs);
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

      const partyName = "my party";

      const createTx = await party
        .connect(host)
        .createEvent(partyName, NOT_RELEVANT, NOT_RELEVANT, NOT_RELEVANT, NOT_RELEVANT);
      await createTx.wait();

      const tx = await party.connect(user).getEventMetadata(1);
      await expect(tx).not.to.be.reverted;

      expect(tx).to.deep.equal([partyName, host.address]);
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
        .to.be.revertedWithCustomError(party, "PartyContract_Rsvp_Price_Must_Be_At_Least")
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

    beforeEach(async () => {
      attendingUser = await getTestUserWithEth(0);
      notAttendingUser = await getTestUserWithEth(1);
    });

    it("reverts when party does not exist", async () => {
      await expect(party.connect(attendingUser).rsvp(INVALID_PARTY_ID)).to.revertedWithCustomError(
        party,
        "PartyContract_Event_Does_Not_Exist",
      );
    });
  });

  describe("withdrawProceeds", () => {
    it("todo");
  });
});

const getTestUserWithEth = async (index: number): Promise<Wallet> => {
  const randomUser = getRandomSigner(index);
  await setETHBalance(randomUser, ethToWei(1));
  return randomUser;
};
