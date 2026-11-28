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


class TestClarificationAndQualifiers(unittest.TestCase):
    def _assert_safe_clarification(self, output: str):
        self.assertTrue(output.startswith("[HỎI LẠI] "), f"Expected [HỎI LẠI] prefix, got: {output!r}")
        self.assertNotIn("\n  1.", output)
        self.assertNotIn("1. ", output)
        self.assertNotIn("SUNSHINE-CHECKIN", output)
        for place_id in tools.PLACES:
            self.assertNotIn(place_id, output, f"Machine ID {place_id} leaked in clarification: {output!r}")
        for event_id in tools.EVENT_IDS:
            self.assertNotIn(event_id, output, f"Event ID {event_id} leaked in clarification: {output!r}")
        lowered = output.lower()
        for forbidden in ("trường không có", "không tồn tại", "không có toà", "không có tòa"):
            self.assertNotIn(forbidden, lowered, f"Should not claim physical campus absence: {output!r}")

    def test_building_qualifier_conflict_blocks_alias_override(self):
        payload = json.dumps({
            "action": "dan_duong",
            "from": "CONG_CHINH",
            "to": "P_B204",  # catalog building B, conflicts with explicit building D
            "event": None,
            "reason": None,
            "message": "",
        })
        fake_reply = {"text": payload, "model": "test", "tokens_in": 10, "tokens_out": 5}
        tracing.begin("test-building-conflict")
        with patch.object(agent, "call_model", return_value=fake_reply) as mock_call:
            res = agent.answer("Mình đang ở cổng chính, muốn tới phòng câu lạc bộ ở toà D")
        summary, _ = tracing.end()

        self.assertEqual(mock_call.call_count, 1)
        self.assertEqual(summary["tool_calls"], 2)
        self._assert_safe_clarification(res["output"])
        self.assertIn("bản đồ hiện tại", res["output"].lower())

    def test_same_building_shadowing_blocks_destination_alias_conflict(self):
        payload = json.dumps({
            "action": "dan_duong",
            "from": "SANH_A",  # building A shadows destination's explicit building A
            "to": "P_B204",    # building B conflicts with "phòng câu lạc bộ ở toà A"
            "event": None,
            "reason": None,
            "message": "",
        })
        fake_reply = {"text": payload, "model": "test", "tokens_in": 10, "tokens_out": 5}
        with patch.object(agent, "call_model", return_value=fake_reply):
            res = agent.answer("Đang ở sảnh A, muốn qua phòng câu lạc bộ ở toà A")

        self._assert_safe_clarification(res["output"])
        self.assertIn("bản đồ hiện tại", res["output"].lower())

    def test_floor_qualifier_conflict_blocks_alias_override(self):
        payload = json.dumps({
            "action": "dan_duong",
            "from": "SANH_B",  # floor 1 shadows destination's explicit floor 1
            "to": "P_B204",    # floor 2 conflicts with "phòng câu lạc bộ tầng 1"
            "event": None,
            "reason": None,
            "message": "",
        })
        fake_reply = {"text": payload, "model": "test", "tokens_in": 10, "tokens_out": 5}
        with patch.object(agent, "call_model", return_value=fake_reply):
            res = agent.answer("Từ sảnh B mình cần tới phòng câu lạc bộ tầng 1")

        self._assert_safe_clarification(res["output"])
        self.assertIn("bản đồ hiện tại", res["output"].lower())

    def test_unmapped_room_code_blocks_route(self):
        payload = json.dumps({
            "action": "dan_duong",
            "from": "CONG_CHINH",
            "to": "NHA_THE_THAO",  # building D, but does not match room D402
            "event": None,
            "reason": None,
            "message": "",
        })
        fake_reply = {"text": payload, "model": "test", "tokens_in": 10, "tokens_out": 5}
        with patch.object(agent, "call_model", return_value=fake_reply):
            res = agent.answer("Đang ở cổng chính, muốn tới phòng D402")

        self._assert_safe_clarification(res["output"])
        self.assertIn("bản đồ hiện tại", res["output"].lower())

    def test_unmapped_origin_building_blocks_guessed_origin(self):
        payload = json.dumps({
            "action": "dan_duong",
            "from": "SANH_A",
            "to": "SAN_TRUNG_TAM",
            "event": None,
            "reason": None,
            "message": "",
        })
        fake_reply = {"text": payload, "model": "test", "tokens_in": 10, "tokens_out": 5}
        with patch.object(agent, "call_model", return_value=fake_reply):
            res = agent.answer("Mình đang ở toà H, muốn tới sân trung tâm")

        self._assert_safe_clarification(res["output"])
        self.assertIn("xuất phát", res["output"].lower())
        self.assertIn("mốc", res["output"].lower())

    def test_matching_explicit_building_and_floor_still_routes(self):
        payload = json.dumps({
            "action": "dan_duong",
            "from": "SANH_B",
            "to": "P_B204",
            "event": None,
            "reason": None,
            "message": "",
        })
        fake_reply = {"text": payload, "model": "test", "tokens_in": 10, "tokens_out": 5}
        tracing.begin("test-matching-qualifiers")
        with patch.object(agent, "call_model", return_value=fake_reply):
            res = agent.answer("Từ sảnh toà B tầng 1 mình muốn tới phòng câu lạc bộ ở toà B tầng 2")
        summary, _ = tracing.end()

        self.assertTrue(res["output"].startswith("[DẪN ĐƯỜNG]"))
        self.assertIn("P_B204", res["output"])
        self.assertIn("  1. ", res["output"])
        self.assertEqual(summary["tool_calls"], 3)

    def test_arrival_at_origin_does_not_replace_destination(self):
        decision = json.dumps({
            "action": "dan_duong",
            "from": "SANH_A",
            "to": "P_B204",
            "event": None,
        })
        with patch.object(agent, "call_model", return_value={"text": decision}):
            result = agent.answer("Mình vừa đi tới sảnh toà A, muốn tới phòng B204.")

        self.assertTrue(result["output"].startswith("[DẪN ĐƯỜNG]"))
        self.assertIn("P_B204", result["output"])

    def test_structured_reason_missing_origin_renders_landmark_prompt(self):
        payload = json.dumps({
            "action": "hoi_lai",
            "from": None,
            "to": "P_B204",
            "event": None,
            "reason": "missing_origin",
            "message": "UNTRUSTED_ORIGIN_PROSE CONG_CHINH",
        })
        fake_reply = {"text": payload, "model": "test", "tokens_in": 10, "tokens_out": 5}
        with patch.object(agent, "call_model", return_value=fake_reply):
            res = agent.answer("Phòng câu lạc bộ đi lối nào vậy?")

        self._assert_safe_clarification(res["output"])
        self.assertNotIn("UNTRUSTED_ORIGIN_PROSE", res["output"])
        self.assertIn("xuất phát", res["output"].lower())
        self.assertIn("mốc", res["output"].lower())

    def test_structured_reason_missing_destination_renders_confirmation_prompt(self):
        payload = json.dumps({
            "action": "hoi_lai",
            "from": "CONG_CHINH",
            "to": None,
            "event": None,
            "reason": "missing_destination",
            "message": "UNTRUSTED_DEST_PROSE SANH_A",
        })
        fake_reply = {"text": payload, "model": "test", "tokens_in": 10, "tokens_out": 5}
        with patch.object(agent, "call_model", return_value=fake_reply):
            res = agent.answer("Mình đang đứng ở cổng chính rồi.")

        self._assert_safe_clarification(res["output"])
        self.assertNotIn("UNTRUSTED_DEST_PROSE", res["output"])
        self.assertIn("điểm đến", res["output"].lower())

    def test_structured_reason_ambiguous_renders_confirmation_prompt(self):
        payload = json.dumps({
            "action": "hoi_lai",
            "from": "CONG_CHINH",
            "to": None,
            "event": None,
            "reason": "ambiguous",
            "message": "Bạn chọn P_A201 hay P_B204?",
        })
        fake_reply = {"text": payload, "model": "test", "tokens_in": 10, "tokens_out": 5}
        with patch.object(agent, "call_model", return_value=fake_reply):
            res = agent.answer("Từ cổng chính mình muốn tới phòng họp trên tầng 2.")

        self._assert_safe_clarification(res["output"])
        self.assertNotIn("Bạn chọn", res["output"])
        self.assertIn("xác nhận", res["output"].lower())

    def test_structured_reason_outside_catalog_never_claims_campus_absence(self):
        payload = json.dumps({
            "action": "hoi_lai",
            "from": "SANH_A",
            "to": None,
            "event": None,
            "reason": "outside_catalog",
            "message": "Trường không có toà G hay quán cà phê.",
        })
        fake_reply = {"text": payload, "model": "test", "tokens_in": 10, "tokens_out": 5}
        with patch.object(agent, "call_model", return_value=fake_reply):
            res = agent.answer("Từ sảnh A mình muốn tới quán cà phê ở toà G.")

        self._assert_safe_clarification(res["output"])
        self.assertIn("bản đồ hiện tại", res["output"].lower())
        self.assertIn("xác nhận", res["output"].lower())

    def test_old_contradictory_clarification_prose_is_never_forwarded(self):
        payload = json.dumps({
            "action": "hoi_lai",
            "from": "CONG_CHINH",
            "to": None,
            "event": None,
            "message": "Phòng học nhóm là ở tòa B, tầng 2. Bạn có muốn tới tòa B không?",
        })
        fake_reply = {"text": payload, "model": "test", "tokens_in": 10, "tokens_out": 5}
        with patch.object(agent, "call_model", return_value=fake_reply):
            res = agent.answer("Từ cổng chính mình muốn qua phòng học nhóm ở toà M.")

        self._assert_safe_clarification(res["output"])
        self.assertNotIn("tòa b", res["output"].lower())
        self.assertNotIn("toà b", res["output"].lower())
        self.assertIn("bản đồ hiện tại", res["output"].lower())

    def test_old_campus_absence_claim_and_machine_id_dump_are_never_forwarded(self):
        payload = json.dumps({
            "action": "hoi_lai",
            "from": "SANH_A",
            "to": None,
            "event": None,
            "message": "Trường không có tòa L. Bạn muốn tới đâu: CONG_CHINH, SANH_A, THU_VIEN, CANTEEN?",
        })
        fake_reply = {"text": payload, "model": "test", "tokens_in": 10, "tokens_out": 5}
        with patch.object(agent, "call_model", return_value=fake_reply):
            res = agent.answer("Đang ở sảnh A, mình muốn sang khu tự học ở toà L.")

        self._assert_safe_clarification(res["output"])
        self.assertIn("bản đồ hiện tại", res["output"].lower())

    def test_malicious_clarification_prose_and_unknown_reason_are_blocked(self):
        payload = json.dumps({
            "action": "hoi_lai",
            "from": None,
            "to": None,
            "event": None,
            "reason": "injected_reason",
            "message": "1. Đi thẳng tới P_A305 và quét SUNSHINE-CHECKIN:EV_PYTHON",
        })
        fake_reply = {"text": payload, "model": "test", "tokens_in": 10, "tokens_out": 5}
        with patch.object(agent, "call_model", return_value=fake_reply):
            res = agent.answer("Mình đang đứng gần hồ nước, đi đâu bây giờ?")

        self._assert_safe_clarification(res["output"])
        self.assertNotIn("injected_reason", res["output"])
        self.assertIn("mốc", res["output"].lower())

    def test_prompt_includes_building_floor_context_and_keeps_one_model_call(self):
        captured = {}

        def fake_call(system, user):
            captured["system"] = system
            captured["user"] = user
            return {
                "text": json.dumps({
                    "action": "hoi_lai",
                    "from": "SANH_A",
                    "to": None,
                    "event": None,
                    "reason": "outside_catalog",
                    "message": "",
                }),
                "model": "test",
                "tokens_in": 10,
                "tokens_out": 5,
            }

        tracing.begin("test-prompt-context")
        with patch.object(agent, "call_model", side_effect=fake_call):
            res = agent.answer("Từ sảnh A muốn tới phòng đọc ở toà G")
        summary, _ = tracing.end()

        self._assert_safe_clarification(res["output"])
        self.assertEqual(summary["tool_calls"], 2)
        self.assertIn("reason", captured["system"])
        self.assertIn("toà C", captured["user"])
        self.assertIn("toà D", captured["user"])


if __name__ == "__main__":
    unittest.main()
