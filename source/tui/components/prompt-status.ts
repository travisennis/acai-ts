import type { ModelManager } from "../../models/manager.ts";
import style from "../../terminal/style.ts";
import type { Component } from "../tui.ts";
import { ProgressBarComponent } from "./progress-bar.ts";

type State = {
  projectStatus: string;
  currentContextWindow: number;
  contextWindow: number;
};

export class PromptStatusComponent implements Component {
  private modelManager: ModelManager;
  private state: State;
  private progressBar: ProgressBarComponent;
  constructor(modelManager: ModelManager, state: State) {
    this.modelManager = modelManager;
    this.state = state;
    this.progressBar = new ProgressBarComponent(
      state.currentContextWindow,
      state.contextWindow,
      0,
    );
  }

  setState(state: State) {
    this.state = state;
    this.progressBar.setCurrent(state.currentContextWindow);
    this.progressBar.setTotal(state.contextWindow);
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
    // Add progress bar output
    results.push(...this.progressBar.render(width));
    return results;
  }
}
