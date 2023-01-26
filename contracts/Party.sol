// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.4;

import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/Address.sol";

// Generic errors
error PartyContract_Event_Does_Not_Exist();

// Create errors
error PartyContract_Event_Must_Allow_Participants();
error PartyContract_Event_Must_Be_In_The_Future();
error PartyContract_Event_Must_Have_Duration();
error PartyContract_Rsvp_Price_Must_Be_Set();

// Rsvp errors
error PartyContract_Already_Checked_In();
error PartyContract_Already_RSVPd();
error PartyContract_Event_Is_Full();
error PartyContract_Rsvp_Stake_Must_Be_At_Least(uint256 rsvpPrice);

// Check-in errors
error PartyContract_Has_Not_RSVPd();

// Time errors
error PartyContract_Event_Has_Ended();
error PartyContract_Event_Has_Not_Started();

contract Party {
    using Address for address payable;

    /// @notice Tracks the next sequence ID to be assigned to a party.
    uint256 private latestPartyId;

    struct EventMetadata {
        string name;
        address organizer;
        uint256 currentParticipantCount;
        uint256 maxParticipantCount;
        /** amount in ETH to rsvp for the event */
        uint256 rsvpPrice;
        /** @notice start date of the event */
        uint256 eventStartDateInSeconds;
        /** @notice end datet of the event */
        uint256 eventEndDateInSeconds;
    }

    struct RsvpStake {
        /** @notice Amount of eth staked. Will be zero for free events */
        uint256 amount;
        /** @notice Has the user rsvp'd? This is exists to support free events */
        bool attending;
    }

    /// @notice Maps a party to the party metadata.
    mapping(uint256 => EventMetadata) idToEventMetadata;

    /// @notice Maps a party to a count of the number of RSVPs.
    mapping(uint256 => EventMetadata) idToAttendeeCount;

    /// @notice Maps a party and attendee to their RSVP stake.
    mapping(uint256 => mapping(address => RsvpStake)) isAndParticipantToRsvpStake;

    /**
     * @notice Emitted when an event is created.
     * @param id of the event
     * @param organizer account which created the event
     *
     * @param name of the event
     * @param maxParticipantCount max number of participants allowed in the event
     * @param rsvpPrice amount in ETH to rsvp for the event
     * @param eventStartDateInSeconds start date of the event. Participants can only check-in after this time.
     * @param eventEndDateInSeconds start date of the event. Participants cannot check-in after this time.
     */
    event EventCreated(
        uint256 id,
        address organizer,
        string name,
        uint256 maxParticipantCount,
        uint256 rsvpPrice,
        uint256 eventStartDateInSeconds,
        uint256 eventEndDateInSeconds
    );

    /**
     * @notice Emitted when an account RSVPs for an event.
     * @param eventId of the event
     * @param participant who RSVPd
     * @param rsvpStake amount of eth staked, which will be zero for free events
     */
    // TODO: Rename to ParticipantConfirmedAttendance
    event AttendeeReplied(uint256 eventId, address participant, uint256 rsvpStake);

    /**
     * @notice Emitted when an account checks-in to an event.
     * @param eventId of the event
     * @param participant who RSVPd
     */
    event ParticipantCheckedIn(uint256 eventId, address participant);

    constructor() {}

    /**
     * @notice Can be called by anyone to create a new event.
     * @param eventName The name for the event.
     * @param maxParticipantCount The max number of participants in the allowed in the event.
     * @param rsvpPrice The amount in ETH to rsvp for the event.
     * @param eventStartDateInSeconds The start date of the event, at which participants can check-in.
     * @param eventDurationInSeconds The duration from the start date to the end of the event.
     */
    function createEvent(
        string calldata eventName,
        uint256 maxParticipantCount,
        uint256 rsvpPrice,
        uint256 eventStartDateInSeconds,
        uint256 eventDurationInSeconds
    ) external returns (uint256 eventId) {
        uint256 id = ++latestPartyId;

        if (maxParticipantCount == 0) {
            revert PartyContract_Event_Must_Allow_Participants();
        }

        if (eventDurationInSeconds == 0) {
            revert PartyContract_Event_Must_Have_Duration();
        }

        if (eventStartDateInSeconds < block.timestamp) {
            revert PartyContract_Event_Must_Be_In_The_Future();
        }

        uint256 eventEndDateInSeconds = eventStartDateInSeconds + eventDurationInSeconds;

        EventMetadata memory party = EventMetadata({
            name: eventName,
            organizer: msg.sender,
            currentParticipantCount: 0,
            maxParticipantCount: maxParticipantCount,
            rsvpPrice: rsvpPrice,
            eventStartDateInSeconds: eventStartDateInSeconds,
            eventEndDateInSeconds: eventEndDateInSeconds
        });

        idToEventMetadata[id] = party;

        emit EventCreated(
            id,
            party.organizer,
            party.name,
            party.maxParticipantCount,
            party.rsvpPrice,
            party.eventStartDateInSeconds,
            party.eventEndDateInSeconds
        );

        return id;
    }

    /**
     * @notice Returns metadata related to the event
     * @param eventId The id of the event.
     */
    function getEventMetadata(uint256 eventId) external view returns (string memory name, address organizer) {
        EventMetadata memory metadata = idToEventMetadata[eventId];

        if (!_doesPartyExist(eventId)) {
            revert PartyContract_Event_Does_Not_Exist();
        }

        return (metadata.name, metadata.organizer);
    }

    /**
     * @notice RSVP for an event. User must sent at least the rsvpPrice in ETH.
     * @param eventId The id of the event.
     */
    function rsvp(uint256 eventId) external payable {
        if (!_doesPartyExist(eventId)) {
            revert PartyContract_Event_Does_Not_Exist();
        }

        RsvpStake memory stake = isAndParticipantToRsvpStake[eventId][msg.sender];

        if (stake.attending == true) {
            revert PartyContract_Already_RSVPd();
        }

        EventMetadata storage metadata = idToEventMetadata[eventId];

        if (metadata.rsvpPrice > 0 && msg.value == 0) {
            revert PartyContract_Rsvp_Price_Must_Be_Set();
        }

        if (metadata.rsvpPrice > 0 && msg.value < metadata.rsvpPrice) {
            revert PartyContract_Rsvp_Stake_Must_Be_At_Least(metadata.rsvpPrice);
        }

        if (metadata.currentParticipantCount >= metadata.maxParticipantCount) {
            revert PartyContract_Event_Is_Full();
        }

        metadata.currentParticipantCount++;
        isAndParticipantToRsvpStake[eventId][msg.sender] = RsvpStake({ amount: msg.value, attending: true });

        emit AttendeeReplied(eventId, msg.sender, msg.value);
    }

    /**
     * @notice Check in to an event
     * @param eventId The id of the event.
     * @dev Notes:
     *  1) Only the RSVPd participant can check in.
     *  2) Check-in is only successful if its during the event (e.g. within start end time)
     *  3) If check-in is successful, the staked ETH should be returned back to the participant.
     */
    function checkIn(uint256 eventId) external payable {
        if (!_doesPartyExist(eventId)) {
            revert PartyContract_Event_Does_Not_Exist();
        }

        EventMetadata memory metadata = idToEventMetadata[eventId];

        if (metadata.eventStartDateInSeconds > block.timestamp) {
            revert PartyContract_Event_Has_Not_Started();
        }

        if (block.timestamp > metadata.eventEndDateInSeconds) {
            revert PartyContract_Event_Has_Ended();
        }

        RsvpStake memory stake = isAndParticipantToRsvpStake[eventId][msg.sender];

        if (!stake.attending) {
            revert PartyContract_Has_Not_RSVPd();
        }

        if (stake.amount > 0) {
            payable(msg.sender).sendValue(stake.amount);
        }

        emit ParticipantCheckedIn(eventId, msg.sender);
    }

    /**
     * @notice Withdraw Proceeds of the event staked by participants that did rsvpd but did not attend.
     * @param eventId The id of the event.
     * @dev Notes:
     *  1) This is a bonus fn, implement this if time permits.
     *  2) Should only be callable by the creator or the event.
     *  3) Can only be executed once the event has ended.
     */
    function withdrawProceeds(uint256 eventId) external {
        EventMetadata memory metadata = idToEventMetadata[eventId];

        if (!_doesPartyExist(eventId)) {
            revert PartyContract_Event_Does_Not_Exist();
        }

        // TODO
    }

    /**
     * @notice Returns true if the party exists.
     * @param eventId The id of the event.
     */
    function _doesPartyExist(uint256 eventId) private view returns (bool) {
        return idToEventMetadata[eventId].maxParticipantCount != 0;
    }
}
