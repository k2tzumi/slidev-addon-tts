export function calculateEffectiveStart(
  resumeFromSec: number | undefined,
  startSec: number,
  endSec: number | null,
): number {
  return (resumeFromSec !== undefined && resumeFromSec > startSec && (endSec === null || resumeFromSec < endSec))
    ? resumeFromSec
    : startSec
}
