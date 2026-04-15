import { generateContractFiles } from "./definitions.js";

async function main(): Promise<void> {
  const generated = await generateContractFiles();
  process.stdout.write(`${generated.join("\n")}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
