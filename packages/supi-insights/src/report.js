const rawHourCounts = __HOUR_COUNTS_JSON__;
function updateHourHistogram(utcOffset) {
  const periods = [
    { label: "Morning (6-12)", range: [6, 7, 8, 9, 10, 11] },
    { label: "Afternoon (12-18)", range: [12, 13, 14, 15, 16, 17] },
    { label: "Evening (18-24)", range: [18, 19, 20, 21, 22, 23] },
    { label: "Night (0-6)", range: [0, 1, 2, 3, 4, 5] },
  ];
  const adjustedCounts = {};
  for (const [hour, count] of Object.entries(rawHourCounts)) {
    const newHour = (parseInt(hour, 10) + utcOffset + 24) % 24;
    adjustedCounts[newHour] = (adjustedCounts[newHour] || 0) + count;
  }
  const periodCounts = periods.map((p) => ({
    label: p.label,
    count: p.range.reduce((sum, h) => sum + (adjustedCounts[h] || 0), 0),
  }));
  const maxCount = Math.max(...periodCounts.map((p) => p.count)) || 1;
  const container = document.getElementById("hour-histogram");
  if (!container) return;
  container.innerHTML = periodCounts
    .map(
      (p) => `
        <div class="bar-row">
          <div class="bar-label">${p.label}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${(p.count / maxCount) * 100}%;background:#8b5cf6"></div></div>
          <div class="bar-value">${p.count}</div>
        </div>
      `,
    )
    .join("");
}
document.getElementById("timezone-select")?.addEventListener("change", function () {
  updateHourHistogram(parseInt(this.value, 10));
});
