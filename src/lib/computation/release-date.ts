/**
 * Release-month cutoff (§8): 22nd–21st window.
 * First payment = release month + addon months on due_day.
 */
export function computeFirstPaymentDate(
  releaseDate: Date,
  addonMonths: number,
  dueDay = 10,
): Date {
  const year = releaseDate.getFullYear();
  const month = releaseDate.getMonth();
  const day = releaseDate.getDate();

  let baseMonth = month;
  let baseYear = year;

  if (day >= 22) {
    baseMonth += 1;
    if (baseMonth > 11) {
      baseMonth = 0;
      baseYear += 1;
    }
  }

  const targetMonth = baseMonth + addonMonths;
  const targetYear = baseYear + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  const paymentDay = Math.min(dueDay, lastDay);

  return new Date(targetYear, normalizedMonth, paymentDay);
}
