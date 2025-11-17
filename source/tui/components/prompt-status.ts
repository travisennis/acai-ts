import { displayProgressBar, hr } from "../../terminal/index.ts";
import style from "../../terminal/style.ts";
import type { Component } from "../index.ts";

type State = {
  modelId: string;
  projectStatus: string;
  currentContextWindow: number;
  contextWindow: number;
};

export class PromptStatusComponent implements Component {
  private state: State;
  constructor(state: State) {
    this.state = state;
  }

  setState(state: State) {
    this.state = state;
  }

  render(width: number): string[] {
    const results: string[] = [];
    results.push(style.dim(hr(width)));
    results.push(this.state.projectStatus);
    results.push(style.dim(this.state.modelId));
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
