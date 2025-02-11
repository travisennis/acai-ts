import { asyncTry } from "@travisennis/stdlib/try";
import chalk from "chalk";
import figlet from "figlet";
import meow from "meow";
import { chatCmd } from "./chatCmd.ts";
import { writeln } from "./command.ts";
import { readAppConfig } from "./config.ts";
import { handleError } from "./errors.ts";

const cli = meow(
  `
	Usage
	  $ acai <input>

	Options
    --model, -m  Sets the model to use
    --prompt, -p  Sets the prompt

	Examples
	  $ acai chat --model anthopric:sonnet
`,
  {
    importMeta: import.meta, // This is required
    flags: {
      model: {
        type: "string",
        shortFlag: "m",
      },
      prompt: {
        type: "string",
        shortFlag: "p",
      },
    },
  },
);

export type Flags = typeof cli.flags;

async function main() {
  writeln(chalk.magenta(figlet.textSync("acai")));
  writeln(chalk.magenta("Greetings!"));
  writeln(chalk.yellow(`The current working directory is ${process.cwd()}`));

  const config = await readAppConfig("acai");

  // const cmd = cli.input.at(0);
  (await asyncTry(chatCmd(cli.flags, config))).recover(handleError);
}

main();
