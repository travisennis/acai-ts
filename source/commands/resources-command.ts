import { loadSkills } from "../skills.ts";
import style from "../terminal/style.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Modal, Container as ModalContainer, ModalText } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

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
        // Load all resources
        const skills = await loadSkills();

        const agentsContent = await options.config.readAgentsFile();
        const agentsExists = agentsContent.length > 0;

        // Group skills by source
        const projectSkills = skills.filter((s) => s.source === "project");
        const userSkills = skills.filter((s) => s.source === "user");
        const otherSkills = skills.filter(
          (s) => s.source !== "project" && s.source !== "user",
        );

        // Build formatted output
        const lines: string[] = [];

        // Skills sections
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

        // AGENTS.md section
        lines.push(style.gray("AGENTS.md:"));
        const agentsPath = "./AGENTS.md";
        if (agentsExists) {
          lines.push(`  • ${agentsPath} ${style.green("(Exists)")}`);
        } else {
          lines.push(`  • ${agentsPath} ${style.dim("(Not found)")}`);
        }

        // Create modal content
        const modalContent = new ModalContainer();
        const formattedText = lines.join("\n");

        if (formattedText.trim()) {
          modalContent.addChild(new ModalText(formattedText, 0, 1));
        } else {
          modalContent.addChild(new ModalText("No resources found.", 0, 1));
        }

        // Create and show modal
        const modal = new Modal("Active Resources", modalContent, true, () => {
          // Modal closed callback
          editor.setText("");
          tui.requestRender();
        });

        tui.showModal(modal);
        return "continue";
      } catch (error) {
        // Show error in modal
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
