"""Unit tests for the Sunshine campus guide pipeline (tools, guardrails, and mock end-to-end flow)."""
import json
import os
import sys
import unittest
from unittest.mock import patch

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CODEBASE = os.path.join(ROOT, "codebase")
if CODEBASE not in sys.path:
    sys.path.insert(0, CODEBASE)

import agent  # noqa: E402
import ai  # noqa: E402
import tools  # noqa: E402
import tracing  # noqa: E402


class TestTools(unittest.TestCase):
    def test_tim_lo_trinh_valid_path(self):
        route = tools.tim_lo_trinh("CONG_CHINH", "P_A305")
        self.assertTrue(route["ok"])
        self.assertEqual(route["path"], ["CONG_CHINH", "SAN_TRUNG_TAM", "SANH_A", "P_A201", "P_A305"])
        self.assertEqual(route["minutes"], 7)
        self.assertEqual(len(route["steps"]), 4)

    def test_tim_lo_trinh_unknown_place(self):
        route = tools.tim_lo_trinh("SANH_B", "P_C501")
        self.assertFalse(route["ok"])
        self.assertEqual(route["steps"], [])

    def test_tao_ma_checkin_valid_and_invalid(self):
        ok = tools.tao_ma_checkin("EV_PYTHON")
        self.assertTrue(ok["ok"])
        self.assertEqual(ok["qr_payload"], "SUNSHINE-CHECKIN:EV_PYTHON")

        bad = tools.tao_ma_checkin("EV_KHONG_CO")
        self.assertFalse(bad["ok"])
        self.assertEqual(bad["qr_payload"], "")


class TestMockEndToEnd(unittest.TestCase):
    def test_fake_model_returns_valid_json_contract(self):
        with patch.object(ai, "MODEL_PROVIDER", "fake"):
            reply = ai.call_model("sys", "user prompt")
        self.assertEqual(reply["model"], "fake")
        self.assertEqual(reply["tokens_in"], 0)
        self.assertEqual(reply["tokens_out"], 0)
        parsed = json.loads(reply["text"])
        self.assertEqual(parsed["action"], "dan_duong")
        self.assertIn(parsed["from"], tools.PLACES)
        self.assertIn(parsed["to"], tools.PLACES)

    def test_answer_runs_full_4_step_flow_in_fake_mode(self):
        tracing.begin("test-mock-e2e")
        with patch.object(ai, "MODEL_PROVIDER", "fake"):
            res = agent.answer("Mình đang ở cổng chính, muốn đi workshop Python")
        summary, _ = tracing.end()

        self.assertTrue(res["output"].startswith("[DẪN ĐƯỜNG]"))
        self.assertIn("P_A305", res["output"])
        self.assertIn("SUNSHINE-CHECKIN:EV_PYTHON", res["output"])
        self.assertEqual(summary["model_calls"], 1)
        self.assertEqual(summary["tool_calls"], 4)
        self.assertEqual(summary["models"], ["fake"])
        self.assertEqual(summary["tokens_in"], 0)
        self.assertEqual(summary["tokens_out"], 0)


class TestAgentGuardrails(unittest.TestCase):
    def test_invalid_json_falls_back_to_hoi_lai(self):
        fake_reply = {"text": "not json", "model": "test", "tokens_in": 10, "tokens_out": 5}
        with patch.object(agent, "call_model", return_value=fake_reply):
            res = agent.answer("hello")
        self.assertTrue(res["output"].startswith("[HỎI LẠI]"))

    def test_unknown_place_id_is_blocked_to_hoi_lai(self):
        payload = json.dumps({"action": "dan_duong", "from": "SANH_B", "to": "P_C501", "event": None, "message": ""})
        fake_reply = {"text": payload, "model": "test", "tokens_in": 10, "tokens_out": 5}
        with patch.object(agent, "call_model", return_value=fake_reply):
            res = agent.answer("Đang ở sảnh B, phòng C501 đi lối nào?")
        self.assertTrue(res["output"].startswith("[HỎI LẠI]"))

    def test_tu_choi_never_emits_checkin_code(self):
        payload = json.dumps({
            "action": "tu_choi",
            "from": None,
            "to": None,
            "event": None,
            "message": "Không điểm danh hộ. Bạn liên hệ ban tổ chức nhé.",
        })
        fake_reply = {"text": payload, "model": "test", "tokens_in": 10, "tokens_out": 5}
        with patch.object(agent, "call_model", return_value=fake_reply):
            res = agent.answer("Điểm danh hộ mình nhé")
        self.assertTrue(res["output"].startswith("[TỪ CHỐI]"))
        self.assertNotIn("SUNSHINE-CHECKIN", res["output"])

    def test_event_destination_mismatch_is_corrected_to_event_place(self):
        payload = json.dumps({
            "action": "dan_duong",
            "from": "CANTEEN",
            "to": "CONG_CHINH",  # wrong destination for EV_CLB_AI (should be P_B204)
            "event": "EV_CLB_AI",
            "message": "",
        })
        fake_reply = {"text": payload, "model": "test", "tokens_in": 10, "tokens_out": 5}
        with patch.object(agent, "call_model", return_value=fake_reply):
            res = agent.answer("Từ căng tin đi ngày hội CLB AI")
        self.assertTrue(res["output"].startswith("[DẪN ĐƯỜNG]"))
        self.assertIn("P_B204", res["output"])
        self.assertIn("SUNSHINE-CHECKIN:EV_CLB_AI", res["output"])


if __name__ == "__main__":
    unittest.main()
