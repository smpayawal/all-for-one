from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[1]
runpy.run_path(str(ROOT / ".github/apply-side-rail-fix-v3.py"), run_name="__main__")

path = ROOT / "packages/coding-agent/src/modes/interactive/interactive-mode.ts"
text = path.read_text(encoding="utf-8")

replacements = {
    "skills: this.sessionRailSkillUsage.usedSkills,": "skills: this.sessionRailSkillUsage?.usedSkills ?? [],",
    "this.sessionRailSkillUsage.resetSession();": "this.sessionRailSkillUsage?.resetSession();",
    "this.sessionRailSkillUsage.resetTurn();": "this.sessionRailSkillUsage?.resetTurn();",
    "this.sessionRailSkillUsage.start(toolCallId, skillName);": "this.sessionRailSkillUsage?.start(toolCallId, skillName);",
    "this.sessionRailSkillUsage.finish(toolCallId, isError);": "this.sessionRailSkillUsage?.finish(toolCallId, isError);",
    "this.resetSessionRailSession();": "this.resetSessionRailSession?.();",
    "if (this.sessionRailSkillUsage.record(skillBlock.name)) this.updateSessionRail();": "if (this.sessionRailSkillUsage?.record(skillBlock.name)) this.updateSessionRail();",
    "this.sessionRailSkillUsage.clearPending();": "this.sessionRailSkillUsage?.clearPending();",
}

for old, new in replacements.items():
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"compatibility replacement {old!r}: expected one match, found {count}")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
