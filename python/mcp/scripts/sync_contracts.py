from __future__ import annotations

import filecmp
import shutil
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SOURCE_DIR = REPO_ROOT / "contracts"
TARGET_DIR = REPO_ROOT / "python" / "mcp" / "src" / "maa_diagnostic_mcp" / "_bundled_contracts"


def collect_names(directory: Path) -> set[str]:
    if not directory.is_dir():
        return set()
    return {path.name for path in directory.glob("*.json")}


def diff_contracts() -> tuple[list[str], list[str], list[str]]:
    source_names = collect_names(SOURCE_DIR)
    target_names = collect_names(TARGET_DIR)

    missing = sorted(source_names - target_names)
    extra = sorted(target_names - source_names)
    changed = sorted(
        name
        for name in source_names & target_names
        if not filecmp.cmp(SOURCE_DIR / name, TARGET_DIR / name, shallow=False)
    )

    return missing, extra, changed


def sync_contracts() -> None:
    TARGET_DIR.mkdir(parents=True, exist_ok=True)

    source_names = collect_names(SOURCE_DIR)
    target_names = collect_names(TARGET_DIR)

    for name in sorted(target_names - source_names):
        (TARGET_DIR / name).unlink()

    for source_path in sorted(SOURCE_DIR.glob("*.json")):
        shutil.copy2(source_path, TARGET_DIR / source_path.name)


def main(argv: list[str]) -> int:
    check_only = "--check" in argv

    if not SOURCE_DIR.is_dir():
        print(f"contracts source directory not found: {SOURCE_DIR}", file=sys.stderr)
        return 1

    if check_only:
        missing, extra, changed = diff_contracts()
        if not missing and not extra and not changed:
            print("Bundled Python MCP contracts are in sync.")
            return 0

        if missing:
            print(f"Missing bundled contracts: {', '.join(missing)}", file=sys.stderr)
        if extra:
            print(f"Unexpected bundled contracts: {', '.join(extra)}", file=sys.stderr)
        if changed:
            print(f"Out-of-date bundled contracts: {', '.join(changed)}", file=sys.stderr)
        return 1

    sync_contracts()
    print(f"Synchronized bundled contracts into {TARGET_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
