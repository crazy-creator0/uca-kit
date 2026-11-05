#!/usr/bin/env python3
"""Copy shared Agent Skills into a coding host's native project skill directory.

Run this from any directory; the skill source is the .agents/skills directory
next to the script's repository root. Existing target skill folders are never
overwritten unless --force is supplied.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path


SKILL_NAME_PATTERN = re.compile(r"^[a-z0-9-]+$")

TARGETS = {
    "agents": Path(".agents/skills"),
    "opencode": Path(".opencode/skills"),
    "claude": Path(".claude/skills"),
    "copilot": Path(".github/skills"),
    "gemini": Path(".gemini/skills"),
    "windsurf": Path(".windsurf/skills"),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Copy portable Agent Skills into a host's native project skill directory."
    )
    parser.add_argument(
        "--target",
        required=True,
        choices=(*TARGETS.keys(), "custom"),
        help="Skill directory convention to use, or 'custom' with --custom-dir.",
    )
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path.cwd(),
        help="Destination project root (default: current working directory).",
    )
    parser.add_argument(
        "--custom-dir",
        help="Relative skill-root path for --target custom, e.g. .my-agent/skills.",
    )
    parser.add_argument(
        "--tier",
        choices=("lite", "standard", "full"),
        help="Copy the skills of this tier, as listed in .agents/tiers.json "
        "(lite uses the condensed skill files). Default: every skill in .agents/skills.",
    )
    parser.add_argument(
        "--profile",
        help="Copy only the skills listed for this profile in .agents/profiles/profiles.json. "
        "With --tier, only skills in both lists are copied (default: all skills).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Update files in existing skill folders. Without this flag, existing skills are skipped.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show planned copies without changing files.",
    )
    return parser.parse_args()


def profile_skill_names(profiles_path: Path, profile: str) -> list[str] | None:
    """Return the skill names for a profile, or None when the profile means every skill.

    Raises ValueError with a readable message for a missing or malformed profile file,
    an unknown profile, or an invalid skill name.
    """
    try:
        profiles = json.loads(profiles_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ValueError(f"Cannot load skill profiles from {profiles_path}: {exc}") from exc
    if profile not in profiles:
        raise ValueError(f'Unknown profile "{profile}". Choose: {", ".join(profiles)}.')
    skills = profiles[profile].get("skills") if isinstance(profiles[profile], dict) else None
    if not isinstance(skills, list):
        raise ValueError(f'Profile "{profile}" must define a "skills" array.')
    for skill in skills:
        if skill != "*" and not (isinstance(skill, str) and SKILL_NAME_PATTERN.match(skill)):
            raise ValueError(f'Profile "{profile}" contains an invalid skill name: {skill}')
    return None if "*" in skills else list(skills)


def tier_definition(tiers_path: Path, tier: str) -> dict:
    """Return a tier's definition from tiers.json, or raise ValueError with a readable message."""
    try:
        tiers = json.loads(tiers_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ValueError(f"Cannot load tiers from {tiers_path}: {exc}") from exc
    definition = tiers.get(tier) if isinstance(tiers, dict) else None
    if (
        not isinstance(definition, dict)
        or not isinstance(definition.get("skillsRoot"), str)
        or not isinstance(definition.get("skills"), list)
    ):
        raise ValueError(f'Tier "{tier}" must define skillsRoot and a skills array.')
    for skill in definition["skills"]:
        if skill != "*" and not (isinstance(skill, str) and SKILL_NAME_PATTERN.match(skill)):
            raise ValueError(f'Tier "{tier}" contains an invalid skill name: {skill}')
    return definition


def main() -> int:
    args = parse_args()
    kit_root = Path(__file__).resolve().parent.parent
    agents_root = kit_root / ".agents"
    source_root = agents_root / "skills"
    tier_names: list[str] | None = None
    if args.tier:
        try:
            definition = tier_definition(agents_root / "tiers.json", args.tier)
        except ValueError as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 2
        relative_root = Path(definition["skillsRoot"])
        if relative_root.is_absolute() or ".." in relative_root.parts:
            print(f'Error: tier "{args.tier}" has an unsafe skillsRoot.', file=sys.stderr)
            return 2
        source_root = kit_root / relative_root
        tier_names = None if "*" in definition["skills"] else list(definition["skills"])
    project_root = args.project_root.expanduser().resolve()

    if args.target == "custom":
        if not args.custom_dir:
            print("Error: --target custom requires --custom-dir.", file=sys.stderr)
            return 2
        relative_destination = Path(args.custom_dir)
        if relative_destination.is_absolute():
            print("Error: --custom-dir must be relative to --project-root.", file=sys.stderr)
            return 2
    else:
        if args.custom_dir:
            print("Error: --custom-dir is only valid with --target custom.", file=sys.stderr)
            return 2
        relative_destination = TARGETS[args.target]

    if not source_root.is_dir():
        print(f"Error: shared skills source was not found: {source_root}", file=sys.stderr)
        return 2

    skill_dirs = sorted(
        path for path in source_root.iterdir()
        if path.is_dir() and (path / "SKILL.md").is_file()
    )
    if not skill_dirs:
        print(f"Error: no skill folders containing SKILL.md were found in {source_root}", file=sys.stderr)
        return 2

    available = {path.name for path in skill_dirs}
    if tier_names is not None:
        missing = [name for name in tier_names if name not in available]
        if missing:
            print(
                f'Error: tier "{args.tier}" lists skills that were not found: {", ".join(missing)}',
                file=sys.stderr,
            )
            return 2
        skill_dirs = [path for path in skill_dirs if path.name in tier_names]

    if args.profile:
        profiles_path = agents_root / "profiles" / "profiles.json"
        try:
            selected = profile_skill_names(profiles_path, args.profile)
        except ValueError as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 2
        if selected is not None:
            if args.tier is None:
                missing = [name for name in selected if name not in available]
                if missing:
                    print(
                        f'Error: profile "{args.profile}" lists skills that were not found: {", ".join(missing)}',
                        file=sys.stderr,
                    )
                    return 2
            skill_dirs = [path for path in skill_dirs if path.name in selected]
        if not skill_dirs:
            print(
                f'Error: profile "{args.profile}" shares no skills with the {args.tier} tier.',
                file=sys.stderr,
            )
            return 2

    destination_root = (project_root / relative_destination).resolve()

    # Avoid trying to copy a directory onto itself when this repository is the target project.
    if source_root.resolve() == destination_root:
        print(f"Skills already use the shared path: {source_root}")
        print(f"No copy needed ({len(skill_dirs)} skills found).")
        return 0

    copied = 0
    skipped = 0
    errors = 0

    for source in skill_dirs:
        destination = destination_root / source.name

        if destination.exists() and not args.force:
            print(f"SKIP existing: {destination} (use --force to update)")
            skipped += 1
            continue

        if args.dry_run:
            action = "UPDATE" if destination.exists() else "COPY"
            print(f"{action}: {source.name} -> {destination}")
            copied += 1
            continue

        try:
            was_existing = destination.exists()
            destination_root.mkdir(parents=True, exist_ok=True)
            shutil.copytree(source, destination, dirs_exist_ok=True)
            print(f"{'UPDATED' if was_existing else 'COPIED'}: {source.name} -> {destination}")
            copied += 1
        except OSError as exc:
            print(f"ERROR copying {source.name}: {exc}", file=sys.stderr)
            errors += 1

    print(f"Summary: {copied} copied/updated, {skipped} skipped, {errors} errors.")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
