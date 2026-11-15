import { useParams } from 'react-router-dom';

// the timestamp the last time the user visited
const lastVisitTimestamp = localStorage.getItem('bitbonesLastVisitTimestamp');

// update the last visited timestamp every n seconds
setInterval(() => {
  localStorage.setItem('bitbonesLastVisitTimestamp', String(Date.now()));
}, 60 * 1000);

const timeFilterNamesToSeconds: Record<string, number | undefined> = {
  '1h': 60 * 60,
  '12h': 60 * 60 * 12,
  '24h': 60 * 60 * 24,
  '48h': 60 * 60 * 24 * 2,
  week: 60 * 60 * 24 * 7,
  month: 60 * 60 * 24 * 30,
  year: 60 * 60 * 24 * 365,
  all: undefined,
};

// calculate the last visit timeFilterNamesToSeconds
const secondsSinceLastVisit = lastVisitTimestamp ? (Date.now() - Number(lastVisitTimestamp)) / 1000 : Infinity;
const day = 24 * 60 * 60;
let lastVisitTimeFilterName: string;
if (secondsSinceLastVisit > 30 * day) {
  lastVisitTimeFilterName = 'month';
  timeFilterNamesToSeconds[lastVisitTimeFilterName] = timeFilterNamesToSeconds['month'];
} else if (secondsSinceLastVisit > 7 * day) {
  const weeks = Math.ceil(secondsSinceLastVisit / day / 7);
  lastVisitTimeFilterName = `${weeks}w`;
  timeFilterNamesToSeconds[lastVisitTimeFilterName] = 60 * 60 * 24 * 7 * weeks;
} else if (secondsSinceLastVisit > day) {
  const days = Math.ceil(secondsSinceLastVisit / day);
  lastVisitTimeFilterName = `${days}d`;
  timeFilterNamesToSeconds[lastVisitTimeFilterName] = 60 * 60 * 24 * days;
} else {
  lastVisitTimeFilterName = '24h';
  timeFilterNamesToSeconds[lastVisitTimeFilterName] = timeFilterNamesToSeconds['24h'];
}

const timeFilterNames = [lastVisitTimeFilterName, '1h', '12h', '24h', '48h', 'week', 'month', 'year', 'all'];

interface TimeFilter {
  timeFilterSeconds: number | undefined;
  timeFilterNames: string[];
}

const useTimeFilter = (): TimeFilter => {
  const params = useParams<{ timeFilterName?: string }>();
  let timeFilterName = params.timeFilterName;

  // the default time filter is the last visit time filter
  if (!timeFilterName) {
    timeFilterName = lastVisitTimeFilterName;
  }

  if (timeFilterName && typeof timeFilterName !== 'string') {
    throw new Error(`useTimeFilter timeFilterName argument '${timeFilterName}' not a string`);
  }
  if (timeFilterName === 'all') {
    return { timeFilterSeconds: undefined, timeFilterNames };
  }
  let timeFilterSeconds = timeFilterNames.includes(timeFilterName) ? timeFilterNamesToSeconds[timeFilterName] : undefined;
  // only this page load's last visit name is in the table, but a URL can keep an 'Nd' or 'Nw' name
  // from an earlier load, so read the number of days or weeks from the name itself
  const dynamicTimeFilterName = timeFilterName.match(/^([1-9]\d*)([dw])$/);
  if (timeFilterSeconds === undefined && dynamicTimeFilterName) {
    timeFilterSeconds = Number(dynamicTimeFilterName[1]) * (dynamicTimeFilterName[2] === 'w' ? 7 * day : day);
  }
  // an unknown name in the URL shows the default feed instead of throwing during render
  if (timeFilterSeconds === undefined) {
    timeFilterSeconds = timeFilterNamesToSeconds[lastVisitTimeFilterName];
  }
  return { timeFilterSeconds, timeFilterNames };
};

export default useTimeFilter;
