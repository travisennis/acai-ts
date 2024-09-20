import { type LanguageModel, generateText } from "ai";

class PlanSearch {
  private systemPrompt: string;
  private model: LanguageModel;

  constructor(systemPrompt: string, model: LanguageModel) {
    this.systemPrompt = systemPrompt;
    this.model = model;
  }

  async generateObservations(
    problem: string,
    numObservations = 3,
  ): Promise<string[]> {
    const prompt = `You are an expert TypeScript programmer. You will be given a competitive programming question
(problem specification). You will return several useful, non-obvious, and correct observations
about the problem, like hints to solve the problem. You will NOT return any code. Be as
creative as possible, going beyond what you think is intuitively correct.

Here is the competitive programming problem:
${problem}

Please provide ${numObservations} observations.`;

    const { text } = await generateText({
      model: this.model,
      maxTokens: 4096,
      system: this.systemPrompt,
      messages: [{ role: "user", content: prompt }],
    });

    const observations = text.trim().split("\n");
    return observations.filter((obs) => obs.trim());
  }

  async generateDerivedObservations(
    problem: string,
    observations: string[],
    numNewObservations = 2,
  ): Promise<string[]> {
    const prompt = `You are an expert TypeScript programmer. You will be given a competitive programming question
(problem specification) and several correct observations about the problem.
You will brainstorm several new, useful, and correct observations about the problem, derived
from the given observations. You will NOT return any code. Be as creative as possible, going
beyond what you think is intuitively correct.

Here is the competitive programming problem:
${problem}

Here are the existing observations:
${observations.map((obs, i) => `${i + 1}. ${obs}`).join("\n")}

Please provide ${numNewObservations} new observations derived from the existing ones.`;

    const { text } = await generateText({
      model: this.model,
      maxTokens: 4096,
      system: this.systemPrompt,
      messages: [{ role: "user", content: prompt }],
    });

    const newObservations = text.trim().split("\n");
    return newObservations.filter((obs) => obs.trim());
  }

  async generateSolution(
    problem: string,
    observations: string[],
  ): Promise<string> {
    const prompt = `Here is the competitive programming problem:
${problem}

Here are the intelligent observations to help solve the problem:
${observations.map((obs, i) => `Observation ${i + 1}: ${obs}`).join("\n")}

Use these observations above to brainstorm a natural language solution to the problem above.
Note that your intuition may lead you astray, so come up with simple, creative ideas that
go beyond what you would usually come up with and exceeds your narrow intuition.
Quote relevant parts of the observations EXACTLY before each step of the solution. QUOTING
IS CRUCIAL.`;

    const { text } = await generateText({
      model: this.model,
      maxTokens: 4096,
      system: this.systemPrompt,
      messages: [{ role: "user", content: prompt }],
    });

    return text.trim();
  }

  async implementSolution(problem: string, solution: string): Promise<string> {
    const prompt = `You are an expert TypeScript programmer. You will be given a question (problem specification)
and a natural language solution/tutorial that describes how to solve the problem. You will
generate a correct TypeScript program that matches said specification and tutorial and passes
all tests. You will NOT return anything except for the program inside markdown codeblocks.

Problem:
${problem}

Solution:
${solution}

Please implement the solution in TypeScript.`;

    const { text } = await generateText({
      model: this.model,
      maxTokens: 4096,
      system: this.systemPrompt,
      messages: [{ role: "user", content: prompt }],
    });

    return text.trim();
  }

  async solve(
    problem: string,
    numInitialObservations = 3,
    numDerivedObservations = 2,
  ): Promise<[string, string]> {
    console.log("Generating initial observations");
    const initialObservations = await this.generateObservations(
      problem,
      numInitialObservations,
    );

    console.log("Generating derived observations");
    const derivedObservations = await this.generateDerivedObservations(
      problem,
      initialObservations,
      numDerivedObservations,
    );

    const allObservations = [...initialObservations, ...derivedObservations];

    console.log("Generating solution based on observations");
    const naturalLanguageSolution = await this.generateSolution(
      problem,
      allObservations,
    );

    console.log("Implementing solution in TypeScript");
    const typescriptImplementation = await this.implementSolution(
      problem,
      naturalLanguageSolution,
    );

    return [naturalLanguageSolution, typescriptImplementation];
  }

  async solveMultiple(
    problem: string,
    n: number,
    numInitialObservations = 3,
    numDerivedObservations = 2,
  ): Promise<string[]> {
    const solutions: string[] = [];
    for (let i = 0; i < n; i++) {
      const [_, typescriptImplementation] = await this.solve(
        problem,
        numInitialObservations,
        numDerivedObservations,
      );
      solutions.push(typescriptImplementation);
    }
    return solutions;
  }
}

export function plansearch(
  systemPrompt: string,
  initialQuery: string,
  model: LanguageModel,
  n = 1,
): Promise<string[]> {
  const planner = new PlanSearch(systemPrompt, model);
  return planner.solveMultiple(initialQuery, n);
}
