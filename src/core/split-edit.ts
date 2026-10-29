// Remainder split from Actual's onDistributeRemainder: empty lines share it evenly, otherwise each line keeps its share of the gap.
export function distributeSplit(parentCents: number, amounts: number[]): number[] {
  const remaining = parentCents - amounts.reduce((sum, amount) => sum + amount, 0);
  const empty = amounts.flatMap((amount, index) => (amount === 0 ? [index] : []));
  if (empty.length > 0) {
    const per = Math.floor(remaining / empty.length);
    let cents = remaining - per * empty.length;
    const next = [...amounts];
    for (const index of empty) next[index] = per;
    for (let index = 0; index < empty.length && cents !== 0; index += 1) {
      next[empty[index]] += 1;
      cents -= 1;
    }
    return next;
  }
  if (amounts.length === 0) return [];
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  if (total === 0) return [...amounts];
  const next = amounts.map((amount) => Math.floor((amount / total) * remaining) + amount);
  let cents = parentCents - next.reduce((sum, amount) => sum + amount, 0);
  let index = 0;
  while (cents !== 0) {
    const at = index % next.length;
    if (cents > 0) {
      next[at] += 1;
      cents -= 1;
    } else {
      next[at] -= 1;
      cents += 1;
    }
    index += 1;
  }
  return next;
}
