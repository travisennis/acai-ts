import { loadSkills } from "../../skills/index.ts";
import style from "../../terminal/style.ts";
import type { Container, Editor, TUI } from "../../tui/index.ts";
import {
  Modal,
  Container as ModalContainer,
  ModalText,
} from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";

export function resourcesCommand(options: CommandOptions): ReplCommand {
  return {
    command: "/resources",
    description: "List all active skills and AGENTS.md",
    aliases: ["/res"],

    getSubCommands: async () => [],

    async handle(
      _args: string[],
      { tui, editor }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      try {
        const skills = await loadSkills();

        const agentsFiles = await options.config.readAgentsFiles();

        const projectSkills = skills.filter((s) => s.source === "project");
        const userSkills = skills.filter((s) => s.source === "user");
        const otherSkills = skills.filter(
          (s) => s.source !== "project" && s.source !== "user",
        );

        const lines: string[] = [];

        if (projectSkills.length > 0) {
          lines.push(style.gray(`Project Skills (${projectSkills.length}):`));
          for (const skill of projectSkills) {
            lines.push(
              `${style.yellow.bold(skill.name)}
${skill.description}
${style.dim(skill.filePath)}
`,
            );
          }
          lines.push("");
        }

        if (userSkills.length > 0) {
          lines.push(style.gray(`User Skills (${userSkills.length}):`));
          for (const skill of userSkills) {
            lines.push(
              `${style.yellow.bold(skill.name)}
${skill.description}
${style.dim(skill.filePath)}
`,
            );
          }
          lines.push("");
        }

        if (otherSkills.length > 0) {
          lines.push(style.gray(`Other Skills (${otherSkills.length}):`));
          for (const skill of otherSkills) {
            lines.push(
              `${style.yellow.bold(skill.name)}
${skill.description}
${style.dim(skill.filePath)} ${style.dim(`[${skill.source}]`)}
`,
            );
          }
          lines.push("");
        }

        lines.push(style.gray("AGENTS.md:"));
        for (const agentsFile of agentsFiles) {
          if (agentsFile.content.length > 0) {
            lines.push(`  • ${agentsFile.path} ${style.green("(Exists)")}`);
          } else {
            lines.push(`  • ${agentsFile.path} ${style.dim("(Not found)")}`);
          }
        }

        const modalContent = new ModalContainer();
        const formattedText = lines.join("\n");

        if (formattedText.trim()) {
          modalContent.addChild(new ModalText(formattedText, 0, 1));
        } else {
          modalContent.addChild(new ModalText("No resources found.", 0, 1));
        }

        const modal = new Modal("Active Resources", modalContent, true, () => {
          editor.setText("");
          tui.requestRender();
        });

        tui.showModal(modal);
        return "continue";
      } catch (error) {
        const errorContent = new ModalContainer();
        errorContent.addChild(
          new ModalText(
            style.red(`Error loading resources: ${(error as Error).message}`),
            0,
            1,
          ),
        );

        const errorModal = new Modal("Error", errorContent, true, () => {
          editor.setText("");
          tui.requestRender();
        });

        tui.showModal(errorModal);
        return "continue";
      }
    },
  };
}
