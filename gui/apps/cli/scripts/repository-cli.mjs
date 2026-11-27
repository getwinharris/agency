const usage = `Usage: bapx-cli repo <command>

Commands:
  inventory   Generate, print, or check the architecture map and source index.
  skills      List, read, or edit tracked Agency skills.

Run bapx-cli repo <command> --help for usage.
`;

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === "inventory") {
    const { runInventory } = await import("./repository-inventory.mjs");
    runInventory(args);
  } else if (command === "skills") {
    const { runSkills } = await import("./repository-skills.mjs");
    runSkills(args);
  } else if (command === undefined || (command === "--help" && !args.length)) {
    process.stdout.write(usage);
  } else {
    throw new Error(usage.trimEnd());
  }
} catch (error) {
  console.error(`bapx-cli repo: ${error.message}`);
  process.exitCode = 1;
}
