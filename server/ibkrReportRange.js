// Flex v3 supports an explicit, inclusive date range on an existing query.
// Keep ranges bounded; never silently replace the requested dates.
export function ibkrReportRange({fromDate, toDate, periodDays} = {}) {
  if (periodDays != null) {
    if (fromDate != null || toDate != null || !Number.isInteger(periodDays) || periodDays < 1 || periodDays > 365) throw new Error('invalid_report_period');
    return {p:String(periodDays)};
  }
  if (fromDate == null && toDate == null) return {};
  const parse = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('invalid_report_date');
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('invalid_report_date');
    return date.getTime();
  };
  const days = (parse(toDate) - parse(fromDate)) / 86400000 + 1;
  if (days < 1 || days > 365) throw new Error('report_range_must_be_1_to_365_days');
  return {fd: fromDate.replaceAll('-', ''), td: toDate.replaceAll('-', '')};
}
