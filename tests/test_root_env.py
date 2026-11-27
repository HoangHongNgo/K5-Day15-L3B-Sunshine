"""Tests for unified root .env.example, backend root .env loader, and codebase/ai.py."""
import importlib.util
import io
import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
ENV_MOD_PATH = ROOT / "vinuni-wayfinder" / "backend" / "app" / "env.py"
CODEBASE = ROOT / "codebase"
if str(CODEBASE) not in sys.path:
    sys.path.insert(0, str(CODEBASE))

import ai  # noqa: E402


def _parse_env_file(path: pathlib.Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


class TestUnifiedEnvExample(unittest.TestCase):
    def test_root_env_example_contains_all_required_fields_and_codex_defaults(self):
        env_example = ROOT / ".env.example"
        self.assertTrue(env_example.is_file(), "Missing root .env.example")
        values = _parse_env_file(env_example)

        self.assertEqual(values.get("MODEL_PROVIDER"), "codex")
        self.assertEqual(values.get("MODEL_NAME"), "6.2-sol")
        for key in (
            "API_KEY",
            "SUPABASE_URL",
            "SUPABASE_SERVICE_KEY",
            "OPENAI_API_KEY",
            "WAYFINDER_BACKEND",
            "TORCH_HOME",
            "HF_HOME",
        ):
            self.assertIn(key, values, f"Missing {key} in root .env.example")

    def test_duplicate_subfolder_env_examples_are_removed(self):
        self.assertFalse((ROOT / "vinuni-wayfinder" / "backend" / ".env.example").exists())
        self.assertFalse((ROOT / "vinuni-wayfinder" / "frontend" / ".env.example").exists())


class TestBackendRootEnvLoader(unittest.TestCase):
    def test_loads_repo_root_env_first_with_env_var_precedence(self):
        self.assertTrue(ENV_MOD_PATH.is_file(), "Missing vinuni-wayfinder/backend/app/env.py")
        spec = importlib.util.spec_from_file_location("wayfinder_env", ENV_MOD_PATH)
        assert spec and spec.loader
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        with tempfile.TemporaryDirectory() as td:
            repo_root = pathlib.Path(td)
            backend_dir = repo_root / "vinuni-wayfinder" / "backend"
            backend_dir.mkdir(parents=True)

            (repo_root / ".env").write_text(
                "SUPABASE_URL=https://root.supabase.co\n"
                "SUPABASE_SERVICE_KEY=root-secret\n"
                "MODEL_PROVIDER=codex\n"
                "MODEL_NAME=6.2-sol\n",
                encoding="utf-8",
            )
            (backend_dir / ".env").write_text(
                "SUPABASE_URL=https://legacy.supabase.co\n"
                "LEGACY_ONLY=from-backend\n",
                encoding="utf-8",
            )

            target_env = {"SUPABASE_SERVICE_KEY": "already-in-process"}
            mod.load_env_files([repo_root / ".env", backend_dir / ".env"], environ=target_env)

            # Process env wins over files; root .env wins over legacy backend/.env.
            self.assertEqual(target_env["SUPABASE_SERVICE_KEY"], "already-in-process")
            self.assertEqual(target_env["SUPABASE_URL"], "https://root.supabase.co")
            self.assertEqual(target_env["MODEL_PROVIDER"], "codex")
            self.assertEqual(target_env["MODEL_NAME"], "6.2-sol")
            self.assertEqual(target_env["LEGACY_ONLY"], "from-backend")

    def test_empty_values_in_env_file_do_not_clobber_defaults(self):
        spec = importlib.util.spec_from_file_location("wayfinder_env_empty", ENV_MOD_PATH)
        assert spec and spec.loader
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        with tempfile.TemporaryDirectory() as td:
            env_file = pathlib.Path(td) / ".env"
            env_file.write_text("TORCH_HOME=\nHF_HOME=\nSUPABASE_URL=https://x.supabase.co\n", encoding="utf-8")
            target_env: dict[str, str] = {}
            mod.load_env_files([env_file], environ=target_env)
            self.assertNotIn("TORCH_HOME", target_env)
            self.assertNotIn("HF_HOME", target_env)
            self.assertEqual(target_env["SUPABASE_URL"], "https://x.supabase.co")


class TestCodebaseAiRootEnv(unittest.TestCase):
    def test_codex_provider_calls_openai_compatible_endpoint_with_usage_tokens(self):
        captured: dict = {}

        class FakeResp:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return json.dumps({
                    "choices": [{"message": {"content": '{"action":"hoi_lai","from":null,"to":null,"event":null,"message":"Bạn ở đâu?"}'}}],
                    "usage": {"prompt_tokens": 120, "completion_tokens": 35},
                }).encode("utf-8")

        def fake_urlopen(req, timeout=60):
            captured["url"] = req.full_url
            captured["auth"] = req.get_header("Authorization")
            captured["body"] = json.loads(req.data.decode("utf-8"))
            return FakeResp()

        with patch.object(ai, "MODEL_PROVIDER", "codex"), \
             patch.object(ai, "MODEL_NAME", "6.2-sol"), \
             patch.object(ai, "API_KEY", "sk-test-key"), \
             patch("urllib.request.urlopen", side_effect=fake_urlopen):
            res = ai.call_model("system prompt", "user prompt")

        self.assertEqual(captured["auth"], "Bearer sk-test-key")
        self.assertEqual(captured["body"]["model"], "6.2-sol")
        self.assertEqual(res["model"], "6.2-sol")
        self.assertEqual(res["tokens_in"], 120)
        self.assertEqual(res["tokens_out"], 35)
        self.assertIn("hoi_lai", res["text"])


if __name__ == "__main__":
    unittest.main()
