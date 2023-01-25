const MS_IN_SEC = 1000;
const MS_IN_MIN = MS_IN_SEC * 60;
const MS_IN_HOUR = MS_IN_MIN * 60;
const MS_IN_DAY = MS_IN_HOUR * 24;

export const ONE_HOUR = MS_IN_HOUR;
export const ONE_DAY = MS_IN_DAY;

export const addDays = (timestamp: number, daysToAdd: number) => {
  const daysToAddInMs = daysToAdd * ONE_DAY;
  return timestamp + daysToAddInMs;
};

export const nowInSeconds = () => {
  return Math.floor(Date.now() / MS_IN_SEC);
};
