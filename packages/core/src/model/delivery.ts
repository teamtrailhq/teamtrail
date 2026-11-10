/** A connector's messages are being refused: the last reason, and how many in a row since the first. */
export interface DeliveryProblem {
  /** The connector, e.g. `slack`. */
  channel: string;
  /** The service's own error code, e.g. `is_archived`. */
  code: string;
  /** What it means and what to do, in one line. */
  message: string;
  /** The first refusal in this run, and the last. */
  since: number;
  at: number;
  /** Refusals in a row; a message that gets through clears the problem. */
  failures: number;
}
