"""Standard-library tests for the cross-platform skill sync utility."""
from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class SyncSkillsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.kit = self.root / "kit"
        self.project = self.root / "project"
        self.script = self.kit / "scripts" / "sync_skills.py"
        source_skill = self.kit / ".agents" / "skills" / "python-engineering"
        source_skill.mkdir(parents=True)
        (source_skill / "SKILL.md").write_text("version = source\n", encoding="utf-8")
        (self.script.parent).mkdir(parents=True, exist_ok=True)
        # Copy the implementation file under test into the synthetic kit.
        current_repo_script = Path(__file__).resolve().parents[1] / "scripts" / "sync_skills.py"
        self.script.write_text(current_repo_script.read_text(encoding="utf-8"), encoding="utf-8")
        self.project.mkdir()

    def run_sync(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(self.script), "--project-root", str(self.project), *args],
            check=False,
            capture_output=True,
            text=True,
        )

    def test_copies_skill_to_native_folder(self) -> None:
        result = self.run_sync("--target", "claude")
        self.assertEqual(result.returncode, 0, result.stderr)
        copied = self.project / ".claude" / "skills" / "python-engineering" / "SKILL.md"
        self.assertEqual(copied.read_text(encoding="utf-8"), "version = source\n")

    def test_existing_skill_is_not_overwritten_without_force(self) -> None:
        target = self.project / ".github" / "skills" / "python-engineering"
        target.mkdir(parents=True)
        skill_file = target / "SKILL.md"
        skill_file.write_text("keep existing\n", encoding="utf-8")

        result = self.run_sync("--target", "copilot")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(skill_file.read_text(encoding="utf-8"), "keep existing\n")
        self.assertIn("SKIP existing", result.stdout)

    def test_force_updates_existing_skill(self) -> None:
        target = self.project / ".gemini" / "skills" / "python-engineering"
        target.mkdir(parents=True)
        skill_file = target / "SKILL.md"
        skill_file.write_text("old content\n", encoding="utf-8")

        result = self.run_sync("--target", "gemini", "--force")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(skill_file.read_text(encoding="utf-8"), "version = source\n")

    def add_profiles(self) -> None:
        for name in ("alpha", "beta"):
            skill = self.kit / ".agents" / "skills" / name
            skill.mkdir(parents=True)
            (skill / "SKILL.md").write_text(f"{name}\n", encoding="utf-8")
        profiles = self.kit / ".agents" / "profiles"
        profiles.mkdir(parents=True)
        (profiles / "profiles.json").write_text(
            '{"all": {"skills": ["*"]}, "small": {"skills": ["alpha"]}, '
            '"missing": {"skills": ["ghost"]}, "bad": {"skills": ["../escape"]}}',
            encoding="utf-8",
        )

    def installed(self, native: str) -> list[str]:
        root = self.project / native / "skills"
        return sorted(path.name for path in root.iterdir()) if root.exists() else []

    def test_profile_limits_copied_skills(self) -> None:
        self.add_profiles()
        result = self.run_sync("--target", "claude", "--profile", "small")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.installed(".claude"), ["alpha"])

    def test_all_profile_copies_every_skill(self) -> None:
        self.add_profiles()
        result = self.run_sync("--target", "gemini", "--profile", "all")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.installed(".gemini"), ["alpha", "beta", "python-engineering"])

    def test_no_profile_copies_every_skill(self) -> None:
        self.add_profiles()
        result = self.run_sync("--target", "copilot")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.installed(".github"), ["alpha", "beta", "python-engineering"])

    def test_unknown_profile_errors_and_copies_nothing(self) -> None:
        self.add_profiles()
        result = self.run_sync("--target", "claude", "--profile", "huge")
        self.assertEqual(result.returncode, 2)
        self.assertIn("Unknown profile", result.stderr)
        self.assertEqual(self.installed(".claude"), [])

    def test_profile_with_missing_skill_errors(self) -> None:
        self.add_profiles()
        result = self.run_sync("--target", "claude", "--profile", "missing")
        self.assertEqual(result.returncode, 2)
        self.assertIn("ghost", result.stderr)
        self.assertEqual(self.installed(".claude"), [])

    def test_profile_with_invalid_skill_name_errors(self) -> None:
        self.add_profiles()
        result = self.run_sync("--target", "claude", "--profile", "bad")
        self.assertEqual(result.returncode, 2)
        self.assertIn("invalid skill name", result.stderr)
        self.assertEqual(self.installed(".claude"), [])

    def test_profile_without_profiles_file_errors(self) -> None:
        result = self.run_sync("--target", "claude", "--profile", "small")
        self.assertEqual(result.returncode, 2)
        self.assertIn("Cannot load skill profiles", result.stderr)

    def add_tiers(self) -> None:
        self.add_profiles()
        lite_skill = self.kit / ".agents" / "lite" / "alpha"
        lite_skill.mkdir(parents=True)
        (lite_skill / "SKILL.md").write_text("alpha lite\n", encoding="utf-8")
        (self.kit / ".agents" / "tiers.json").write_text(
            '{"lite": {"skillsRoot": ".agents/lite", "skills": ["alpha"]}, '
            '"standard": {"skillsRoot": ".agents/skills", "skills": ["alpha", "beta"]}, '
            '"full": {"skillsRoot": ".agents/skills", "skills": ["*"]}}',
            encoding="utf-8",
        )

    def test_lite_tier_copies_the_condensed_skill_files(self) -> None:
        self.add_tiers()
        result = self.run_sync("--target", "claude", "--tier", "lite")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.installed(".claude"), ["alpha"])
        copied = self.project / ".claude" / "skills" / "alpha" / "SKILL.md"
        self.assertEqual(copied.read_text(encoding="utf-8"), "alpha lite\n")

    def test_standard_tier_copies_only_its_listed_skills(self) -> None:
        self.add_tiers()
        result = self.run_sync("--target", "claude", "--tier", "standard")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.installed(".claude"), ["alpha", "beta"])

    def test_full_tier_copies_every_skill(self) -> None:
        self.add_tiers()
        result = self.run_sync("--target", "claude", "--tier", "full")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.installed(".claude"), ["alpha", "beta", "python-engineering"])

    def test_tier_and_profile_copy_only_skills_in_both(self) -> None:
        self.add_tiers()
        result = self.run_sync("--target", "claude", "--tier", "standard", "--profile", "small")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.installed(".claude"), ["alpha"])

    def test_tier_and_profile_with_no_common_skill_errors(self) -> None:
        self.add_tiers()
        profiles = self.kit / ".agents" / "profiles" / "profiles.json"
        profiles.write_text('{"other": {"skills": ["python-engineering"]}}', encoding="utf-8")
        result = self.run_sync("--target", "claude", "--tier", "lite", "--profile", "other")
        self.assertEqual(result.returncode, 2)
        self.assertIn("shares no skills", result.stderr)
        self.assertEqual(self.installed(".claude"), [])

    def test_invalid_tier_name_is_rejected_by_the_parser(self) -> None:
        self.add_tiers()
        result = self.run_sync("--target", "claude", "--tier", "huge")
        self.assertEqual(result.returncode, 2)
        self.assertEqual(self.installed(".claude"), [])

    def rewrite_lite_tier(self, definition: str) -> None:
        (self.kit / ".agents" / "tiers.json").write_text(
            '{"lite": ' + definition + ', "standard": {"skillsRoot": ".agents/skills", "skills": ["*"]}, '
            '"full": {"skillsRoot": ".agents/skills", "skills": ["*"]}}',
            encoding="utf-8",
        )

    def test_tier_with_missing_skill_errors_and_copies_nothing(self) -> None:
        self.add_profiles()
        self.rewrite_lite_tier('{"skillsRoot": ".agents/skills", "skills": ["ghost"]}')
        result = self.run_sync("--target", "claude", "--tier", "lite")
        self.assertEqual(result.returncode, 2)
        self.assertIn("ghost", result.stderr)
        self.assertEqual(self.installed(".claude"), [])

    def test_tier_with_unsafe_skills_root_errors(self) -> None:
        self.add_profiles()
        self.rewrite_lite_tier('{"skillsRoot": "../outside", "skills": ["alpha"]}')
        result = self.run_sync("--target", "claude", "--tier", "lite")
        self.assertEqual(result.returncode, 2)
        self.assertIn("unsafe skillsRoot", result.stderr)
        self.assertEqual(self.installed(".claude"), [])

    def test_tier_with_invalid_skill_name_errors(self) -> None:
        self.add_profiles()
        self.rewrite_lite_tier('{"skillsRoot": ".agents/skills", "skills": ["../x"]}')
        result = self.run_sync("--target", "claude", "--tier", "lite")
        self.assertEqual(result.returncode, 2)
        self.assertIn("invalid skill name", result.stderr)
        self.assertEqual(self.installed(".claude"), [])

    def test_tier_without_tiers_file_errors(self) -> None:
        self.add_profiles()
        result = self.run_sync("--target", "claude", "--tier", "lite")
        self.assertEqual(result.returncode, 2)
        self.assertIn("Cannot load tiers", result.stderr)

    def test_custom_target_requires_custom_dir(self) -> None:
        result = self.run_sync("--target", "custom")
        self.assertEqual(result.returncode, 2)
        self.assertIn("--custom-dir", result.stderr)


if __name__ == "__main__":
    unittest.main()
