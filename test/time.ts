// Type aliases to help with readability
type Milliseconds = number;
type Seconds = number;

const MS_IN_SEC = 1000;
const MS_IN_MIN = MS_IN_SEC * 60;
const MS_IN_HOUR = MS_IN_MIN * 60;
const MS_IN_DAY = MS_IN_HOUR * 24;

/**
 * @param {number} ms milliseconds
 * @returns {number} seconds
 */
const millisecondsToSeconds = (ms: Milliseconds): Seconds => {
  return Math.floor(ms / MS_IN_SEC);
};

const SECONDS_IN_HOUR = millisecondsToSeconds(MS_IN_HOUR);
const SECONDS_IN_DAY = millisecondsToSeconds(MS_IN_DAY);

export const hoursInSeconds = (hours: number) => {
  return hours * SECONDS_IN_HOUR;
};

export const daysInSeconds = (days: number) => {
  return days * SECONDS_IN_DAY;
};

export const nowInSeconds = () => {
  const now = Date.now();
  return millisecondsToSeconds(now);
};
