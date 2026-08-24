let choiceSeq = 0;
let questionSeq = 0;
let sectionSeq = 0;

function nextChoiceId() {
  choiceSeq += 1;
  return `choice-${Date.now()}-${choiceSeq}`;
}

function nextQuestionId() {
  questionSeq += 1;
  return `question-${Date.now()}-${questionSeq}`;
}

function nextSectionId() {
  sectionSeq += 1;
  return `section-${Date.now()}-${sectionSeq}`;
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
    showTip: false,
    tip: '',
    choices: [
      createChoice('Choice 1', true),
      createChoice('Choice 2', false),
      createChoice('Choice 3', false),
      createChoice('Choice 4', false),
    ],
  };
}

/**
 * @returns {import('../types/quizBuilder.types.js').QuizSection}
 */
export function createQuizSection() {
  return {
    id: nextSectionId(),
    itemType: 'section',
    subjectId: null,
    subjectLabel: '',
    collapsed: false,
    showDividerContent: false,
    dividerContentHtml: '',
  };
}

/**
 * @param {import('../types/quizBuilder.types.js').QuizSection} section
 */
export function cloneQuizSection(section) {
  return {
    ...section,
    id: nextSectionId(),
    itemType: 'section',
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
