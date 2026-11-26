// Mark the Madrid calendar days touched by a confirmed continuous outage.
export const threeHours = 3 * 60 * 60 * 1000;
const dateKey = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
});

export function longOutageDays(intervals) {
  const days = new Set();
  for (const {start, end} of intervals) {
    if (end - start <= threeHours) continue;
    const last = dateKey.format(end);
    const day = new Date(dateKey.format(start) + 'T12:00:00Z');
    while (day.toISOString().slice(0, 10) <= last) {
      days.add(day.toISOString().slice(0, 10));
      day.setUTCDate(day.getUTCDate() + 1);
    }
  }
  return [...days];
}

export function sampleOutages(samples) {
  const intervals = [];
  let run;
  for (const sample of samples) {
    if (sample.state !== 'down') {
      run = undefined;
      continue;
    }
    const at = Date.parse(sample.at);
    // The local scheduler waits five minutes after a round. A round can last up to
    // 35s: a 15s attempt, a 5s pause and a 15s retry.
    if (!run || at - run.end > 340000) {
      run = {start: at, end: at};
      intervals.push(run);
    }
    run.end = at;
  }
  return intervals;
}
