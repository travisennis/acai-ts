import type { ModelManager } from "../../models/manager.ts";
import { displayProgressBar } from "../../terminal/index.ts";
import style from "../../terminal/style.ts";
import type { Component } from "../index.ts";

type State = {
  projectStatus: string;
  currentContextWindow: number;
  contextWindow: number;
};

export class PromptStatusComponent implements Component {
  private modelManager: ModelManager;
  private state: State;
  constructor(modelManager: ModelManager, state: State) {
    this.modelManager = modelManager;
    this.state = state;
  }

  setState(state: State) {
    this.state = state;
  }

  render(width: number): string[] {
    const results: string[] = [];
    // results.push(style.dim(hr(width)));
    results.push(this.state.projectStatus);
    results.push(
      style.dim(
        `${this.modelManager.getModelMetadata("repl").id} [${this.modelManager.getModel("repl").modelId}]`,
      ),
    );
    results.push(
      displayProgressBar(
        this.state.currentContextWindow,
        this.state.contextWindow,
        width,
      ),
    );
    return results;
  }
}
