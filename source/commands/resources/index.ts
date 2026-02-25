import type { Skill } from "../../skills/index.ts";
import { loadSkills } from "../../skills/index.ts";
import style from "../../terminal/style.ts";
import type { Container, Editor, TUI } from "../../tui/index.ts";
import {
  Modal,
  Container as ModalContainer,
  ModalText,
} from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";

function formatSkillSection(
  label: string,
  skills: Skill[],
  showSource = false,
): string[] {
  if (skills.length === 0) return [];

  const lines: string[] = [style.gray(`${label} (${skills.length}):`)];
  for (const skill of skills) {
    const pathSuffix = showSource ? ` ${style.dim(`[${skill.source}]`)}` : "";
    lines.push(
      `${style.yellow.bold(skill.name)}\n${skill.description}\n${style.dim(skill.filePath)}${pathSuffix}\n`,
    );
  }
  lines.push("");
  return lines;
}

function formatAgentsFiles(
  agentsFiles: Array<{ path: string; content: string }>,
): string[] {
  const lines: string[] = [style.gray("AGENTS.md:")];
  for (const agentsFile of agentsFiles) {
    const status =
      agentsFile.content.length > 0
        ? style.green("(Exists)")
        : style.dim("(Not found)");
    lines.push(`  • ${agentsFile.path} ${status}`);
  }
  return lines;
}

export function resourcesCommand(options: CommandOptions): ReplCommand {
  return {
    command: "/resources",
    description: "List all active skills and AGENTS.md",
    aliases: ["/res"],

    getSubCommands: async () => [],

    async handle(
      _args: string[],
      { tui, editor }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"continue" | "use"> {
      try {
        const skills = await loadSkills();
        const allSkills = skills.getAll();
        const agentsFiles = await options.config.readAgentsFiles();

        const projectSkills = allSkills.filter((s) => s.source === "project");
        const userSkills = allSkills.filter((s) => s.source === "user");
        const otherSkills = allSkills.filter(
          (s) => s.source !== "project" && s.source !== "user",
        );

        const lines: string[] = [
          ...formatSkillSection("Project Skills", projectSkills),
          ...formatSkillSection("User Skills", userSkills),
          ...formatSkillSection("Other Skills", otherSkills, true),
          ...formatAgentsFiles(agentsFiles),
        ];

        const modalContent = new ModalContainer();
        const formattedText = lines.join("\n");
        modalContent.addChild(
          new ModalText(
            formattedText.trim() ? formattedText : "No resources found.",
            0,
            1,
          ),
        );

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
