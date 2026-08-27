// Booking workflow state machine:
// REQUESTED -> MATCHED -> BOOKING_REQUESTED -> CONFIRMED -> IN_PROGRESS -> COMPLETED
// Any non-terminal state may transition to CANCELLED.

export const STATES = [
  'REQUESTED',
  'MATCHED',
  'BOOKING_REQUESTED',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];

const TRANSITIONS = {
  REQUESTED: ['MATCHED', 'BOOKING_REQUESTED', 'CANCELLED'],
  MATCHED: ['BOOKING_REQUESTED', 'CANCELLED'],
  BOOKING_REQUESTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`Cannot transition booking from ${from} to ${to}`);
  }
}
