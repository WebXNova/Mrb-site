/** Student question lifecycle — mirrors server public status contract. */
export const STUDENT_QUESTION_STATUS = Object.freeze({
  SENT: 'sent',
  SEEN: 'seen',
  ANSWERED: 'answered',
});

export function studentQuestionStatusLabel(status) {
  switch (status) {
    case STUDENT_QUESTION_STATUS.ANSWERED:
      return 'Answered';
    case STUDENT_QUESTION_STATUS.SEEN:
      return 'Seen';
    case STUDENT_QUESTION_STATUS.SENT:
    default:
      return 'Sent';
  }
}

export function studentQuestionStatusBadgeClass(status) {
  switch (status) {
    case STUDENT_QUESTION_STATUS.ANSWERED:
      return 'sqachat-badge--answered';
    case STUDENT_QUESTION_STATUS.SEEN:
      return 'sqachat-badge--seen';
    case STUDENT_QUESTION_STATUS.SENT:
    default:
      return 'sqachat-badge--sent';
  }
}

export function studentQuestionReplyHint(status, hasReply) {
  if (hasReply || status === STUDENT_QUESTION_STATUS.ANSWERED) {
    return 'Teacher reply available';
  }
  if (status === STUDENT_QUESTION_STATUS.SEEN) {
    return 'Teacher has seen your question';
  }
  return 'Waiting for teacher reply';
}
