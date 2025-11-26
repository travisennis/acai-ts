type DebugLevel = 0 | 1 | 2 | 3;

let messages: string[] = [];
let level: DebugLevel = 0;

const debug = (msg: string, min: DebugLevel): void => {
  if (level >= min) {
    messages.push(msg);
  }
};

debug.WARN = 1 as const;
debug.INFO = 2 as const;
debug.DEBUG = 3 as const;

debug.reset = (): void => {
  messages = [];
};

debug.setDebugLevel = (v: number | string | boolean): void => {
  if (typeof v === "boolean") {
    level = v ? debug.WARN : 0;
  } else if (typeof v === "number") {
    level = v as DebugLevel;
  } else if (typeof v === "string") {
    level = Number.parseInt(v, 10) as DebugLevel;
  } else {
    level = debug.WARN;
  }
};

debug.warn = (msg: string): void => debug(msg, debug.WARN);
debug.info = (msg: string): void => debug(msg, debug.INFO);
debug.debug = (msg: string): void => debug(msg, debug.DEBUG);

debug.debugMessages = (): string[] => messages;

export default debug;
