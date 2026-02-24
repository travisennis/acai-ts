type QuoteArg = string | number | boolean | { op: string } | null | undefined;

export function quote(xs: readonly QuoteArg[]): string {
  return xs
    .map((s) => {
      if (s === null || s === undefined) {
        return String(s);
      }
      const str = String(s);
      if (str === "") {
        return "''";
      }
      if (s && typeof s === "object") {
        return s.op.replace(/(.)/g, "\\$1");
      }
      if (/["\s\\]/.test(str) && !/'/.test(str)) {
        return `'${str.replace(/(['])/g, "\\$1")}'`;
      }
      if (/["'\s]/.test(str)) {
        return `"${str.replace(/(["\\$`!])/g, "\\$1")}"`;
      }
      return str.replace(
        /([A-Za-z]:)?([#!"$&'()*,:;<=>?@[\\\]^`{|}])/g,
        "$1\\$2",
      );
    })
    .join(" ");
}
