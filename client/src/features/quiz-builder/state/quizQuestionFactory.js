let choiceSeq = 0;
let questionSeq = 0;

function nextChoiceId() {
  choiceSeq += 1;
  return `choice-${Date.now()}-${choiceSeq}`;
}

function nextQuestionId() {
  questionSeq += 1;
  return `question-${Date.now()}-${questionSeq}`;
}

/**
 * @param {string} text
 * @param {boolean} [isCorrect]
 * @returns {import('../types/quizBuilder.types.js').QuizChoice}
 */
export function createChoice(text = '', isCorrect = false) {
  return {
    id: nextChoiceId(),
    text,
    isCorrect,
  };
}

/**
 * @returns {import('../types/quizBuilder.types.js').QuizQuestion}
 */
export function createQuizQuestion() {
  return {
    id: nextQuestionId(),
    title: '',
    questionText: '',
    points: 1,
    questionType: 'multiple_choice',
    collapsed: false,
    showExplanation: false,
    explanation: '',
    choices: [
      createChoice('Choice 1', true),
      createChoice('Choice 2', false),
      createChoice('Choice 3', false),
      createChoice('Choice 4', false),
    ],
  };
}

/**
 * @param {import('../types/quizBuilder.types.js').QuizQuestion} question
 */
export function cloneQuizQuestion(question) {
  return {
    ...question,
    id: nextQuestionId(),
    questionType: 'multiple_choice',
    choices: question.choices.map((c) => ({
      ...c,
      id: nextChoiceId(),
    })),
  };
}
