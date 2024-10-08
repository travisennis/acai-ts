import chalk from "chalk";
import figlet from "figlet";
import meow from "meow";
import { bonCmd } from "./bon.js";
import { chatCmd } from "./chatCmd.js";
import { writeln } from "./command.js";
import { readAppConfig } from "./config.js";
import { handleError } from "./errors.js";
import { asyncTry, tryOrFail } from "./utils.js";

const cli = meow(
  `
	Usage
	  $ acai <input>

	Options
    --provider, -p  Sets the provider to use

	Examples
	  $ acai chat --provider anthropic
`,
  {
    importMeta: import.meta, // This is required
    flags: {
      provider: {
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

  const cmd = cli.input.at(0);
  if (cmd === "chat") {
    tryOrFail(await asyncTry(chatCmd(cli.flags, config)), handleError);
  } else if (cmd === "bon") {
    tryOrFail(await bonCmd(), handleError);
  }
}

main();
