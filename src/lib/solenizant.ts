export const SOLENIZANT_TITLE = "SOLENIZANT";

export const SOLENIZANT_QUESTIONS = [
  "Jak nazywał się kanał na YouTube, który prowadził Kamil w gimnazjum?",
  "Podaj dokładną datę urodzin Kamila.",
  "Co wrzucił Kamil pani od geografii do cycków?",
  "Kim Kamil chce zostać w przyszłości?",
  "Kto zesrał się na podłogę na 20. urodzinach Kamila? (Wystarczy imię).",
  "Podaj jeden składnik dania, które wypadło Kamilowi z nosa, gdy się za szybko schylal srajac?",
] as const;

export const SOLENIZANT_QUESTION_COUNT = SOLENIZANT_QUESTIONS.length;
export const SOLENIZANT_LAST_QUESTION_INDEX = SOLENIZANT_QUESTION_COUNT - 1;

export function getSolenizantQuestion(questionIndex: number) {
  return SOLENIZANT_QUESTIONS[questionIndex] ?? null;
}
