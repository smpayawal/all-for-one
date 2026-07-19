from pathlib import Path

path = Path("packages/coding-agent/test/suite/regressions/4167-thinking-toggle-pending-tool-render.test.ts")
content = path.read_text()
old = "\t\tupdateEditorBorderColor: vi.fn(),\n"
new = "\t\tupdateEditorBorderColor: vi.fn(),\n\t\tfinishSessionRailTool: vi.fn(),\n"
if old in content:
    path.write_text(content.replace(old, new, 1))
elif new not in content:
    raise RuntimeError("Missing fake InteractiveMode updateEditorBorderColor entry")
