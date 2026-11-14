"""The to-do list (the deployment notes, 2026-11-07): Claude's 「状態:」 line read from
the Stop hook's input; only what needs the user pushes; a session archived
right after its Stop stays quiet; 寝かせ comes back when its date comes.

    python3 -m unittest discover -s tests -v
"""
import datetime
import json
import tempfile
import time
import unittest
from pathlib import Path

from test_shared_search import B


def ts(y, mo, d, h=0, mi=0):
    return datetime.datetime(y, mo, d, h, mi).timestamp()


class ParseTest(unittest.TestCase):
    NOW = ts(2026, 11, 7, 15, 0)

    def p(self, text):
        return B.parse_task_line(text, self.NOW)

    def test_states(self):
        self.assertEqual(self.p("本文\n\n状態: 要判断 — 返信案AかBか"), {"state": "you", "text": "返信案AかBか"})
        self.assertEqual(self.p("状態：済み：図を直した"), {"state": "done", "text": "図を直した"})
        self.assertEqual(self.p("**状態:** 済み — 太字でも"), {"state": "done", "text": "太字でも"})

    def test_none(self):
        self.assertIsNone(self.p("ただの返事です"))
        self.assertIsNone(self.p("状態: 要判断 — 古い\nあ\nい\nう"))  # only the last lines count
        self.assertIsNone(self.p(""))

    def test_snooze_dates(self):
        r = self.p("状態: 寝かせ 11/12 15:30 — Bさんの返事待ち")
        self.assertEqual(r, {"state": "snooze", "until": ts(2026, 11, 12, 15, 30), "text": "Bさんの返事待ち"})
        self.assertEqual(self.p("状態: 寝かせ 11/12 — x")["until"], ts(2026, 11, 12, 9, 0))
        self.assertEqual(self.p("状態: 寝かせ 1/5 — 年明け")["until"], ts(2027, 1, 5, 9, 0))
        self.assertEqual(self.p("状態: 寝かせ — 日付なし")["until"], ts(2026, 11, 8, 9, 0))
        self.assertEqual(self.p("状態: 寝かせ 13/40 — 変な日付")["until"], ts(2026, 11, 8, 9, 0))

    def test_text_capped(self):
        self.assertEqual(len(self.p("状態: 要判断 — " + "あ" * 200)["text"]), B.TASK_TEXT_MAX)


class TaskTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.pushes = []
        self.timers = []
        self.saved = {n: getattr(B, n) for n in ("session_dir", "iter_session_dirs", "send_push_notification",
                                                 "stop_session", "TASK_DECIDE_DELAY")}
        B.session_dir = lambda sid: self.root / sid
        B.iter_session_dirs = lambda: sorted(p for p in self.root.iterdir() if p.is_dir())
        B.send_push_notification = lambda sid, msg: self.pushes.append((sid, msg))
        self.stopped = []
        B.stop_session = lambda sid: self.stopped.append(sid)
        B.TASK_DECIDE_DELAY = 0.01
        B._task_recent.clear()

    def tearDown(self):
        for n, v in self.saved.items():
            setattr(B, n, v)
        self.tmp.cleanup()

    def sess(self, sid, **kw):
        d = self.root / sid
        d.mkdir()
        (d / "meta.json").write_text(json.dumps({"id": sid, "label": "L-" + sid, **kw}))
        return d

    def stop(self, sid, text):
        B.task_hook(sid, {"hook_event_name": "Stop", "last_assistant_message": text})
        time.sleep(0.15)

    def test_decision_pushes_done_does_not(self):
        self.sess("a1")
        self.stop("a1", "結果です\n状態: 要判断 — どちらで送るか")
        self.assertEqual(self.pushes, [("a1", "要判断: どちらで送るか")])
        self.assertEqual(B.load_task("a1")["state"], "you")
        self.stop("a1", "直しました\n状態: 済み — 図の修正")
        self.assertEqual(len(self.pushes), 1)
        t = B.load_task("a1")
        self.assertEqual((t["state"], t["text"], t["seen"]), ("done", "図の修正", False))

    def test_undeclared_stop_pushes_without_content(self):
        self.sess("a2")
        self.stop("a2", "秘密の本文")
        self.assertEqual(self.pushes, [("a2", "止まりました(状態の申告なし)")])
        self.assertEqual(B.load_task("a2")["declared"], False)

    def test_same_stop_from_both_routes_once(self):
        self.sess("a3")
        B.task_hook("a3", {"hook_event_name": "Stop", "last_assistant_message": "状態: 要判断 — x"})
        self.stop("a3", "状態: 要判断 — x")
        self.assertEqual(len(self.pushes), 1)

    def test_archived_right_after_stop_is_quiet(self):
        d = self.sess("a4")
        (d / B.ARCHIVE_ON_EXIT).write_text("")
        self.stop("a4", "状態: 済み — 既決にした")
        self.stop("a4", "状態: 要判断 — 送信の確認")
        self.assertEqual(self.pushes, [])
        self.assertEqual(B.load_task("a4")["seen"], True)

    def test_user_reply_wins_over_late_decision(self):
        self.sess("a5")
        B.task_hook("a5", {"hook_event_name": "Stop", "last_assistant_message": "状態: 要判断 — x"})
        B.task_user_sent("a5")
        time.sleep(0.15)
        self.assertEqual(B.load_task("a5")["state"], "working")
        self.assertEqual(self.pushes, [])

    def test_notifications(self):
        self.sess("a6")
        B.task_hook("a6", {"hook_event_name": "Notification", "notification_type": "idle_prompt",
                           "message": "Claude is waiting for your input"})
        self.assertEqual(self.pushes, [])
        B.task_hook("a6", {"hook_event_name": "Notification", "notification_type": "permission_prompt",
                           "message": "Claude needs your permission to use Bash"})
        self.assertEqual(self.pushes, [("a6", "Claude needs your permission to use Bash")])
        self.assertEqual(B.load_task("a6")["state"], "you")

    def test_snooze_fires_once_and_stops_devbox_session(self):
        self.sess("b1", tmux_location="container", preset="claude-tui")
        self.sess("b2", tmux_location="host", preset="claude-tui")
        self.sess("b3", tmux_location="container", preset="claude-tui")
        now = time.time()
        B.save_task("b1", {"state": "snooze", "until": now - 5, "ts": now - 7200, "text": "期限"})
        B.save_task("b2", {"state": "snooze", "until": now + 86400, "ts": now - 7200, "text": "ホスト"})
        B.save_task("b3", {"state": "snooze", "until": now + 86400, "ts": now - 7200, "text": "devbox"})
        B._task_check_once()
        B._task_check_once()
        self.assertEqual(self.pushes, [("b1", "寝かせの期限: 期限")])
        self.assertEqual(self.stopped, ["b3"])  # not the host one (passkey), not the due one
        self.assertTrue(B.load_task("b3")["auto_stopped"])

    def test_update_by_hand(self):
        self.sess("c1")
        now = time.time()
        self.assertEqual(B.task_update("c1", {"state": "snooze", "until": now + 3600})["until"], now + 3600)
        with self.assertRaises(ValueError):
            B.task_update("c1", {"state": "snooze", "until": now - 10})
        with self.assertRaises(ValueError):
            B.task_update("c1", {"state": "bogus"})
        self.assertEqual(B.task_update("c1", {"state": "done"})["state"], "done")
        B.save_task("c1", dict(B.load_task("c1"), seen=False))
        self.assertTrue(B.task_update("c1", {"seen": True})["seen"])
        self.assertIsNone(B.task_update("c1", {"state": None}))
        self.assertIsNone(B.load_task("c1"))

    def test_restore_after_check(self):
        # The list's 8-second "元に戻す" after ✓ puts the task back as it was.
        self.sess("c2")
        old = {"state": "you", "text": "見て", "ts": 123.0, "declared": True, "seen": False, "prompt": True}
        B.save_task("c2", dict(old))
        B.task_update("c2", {"state": "done"})
        self.assertEqual(B.task_update("c2", {"restore": dict(old, junk="x")}), old)
        self.assertEqual(B.load_task("c2"), old)
        self.assertIsNone(B.task_update("c2", {"restore": None}))
        with self.assertRaises(ValueError):
            B.task_update("c2", {"restore": {"state": "bogus"}})

    def test_new_turn_in_log_means_working(self):
        # 済み, then a turn typed anywhere (terminal, talkto, the box): working.
        self.sess("c3")
        B.save_task("c3", {"state": "done", "text": "直した", "ts": 1000.0, "declared": True, "seen": True})
        def line(content, t="2026-11-10T12:00:00.000Z", **kw):
            return json.dumps(dict({"type": "user", "timestamp": t, "message": {"role": "user", "content": content}}, **kw)).encode() + b"\n"
        for skip in (line([{"type": "tool_result", "content": "x"}]), line("<command-name>/clear</command-name>"),
                     line("要約", isCompactSummary=True), line("x", isMeta=True)):
            B._split_assistant_text_events(skip, "c3")
            self.assertEqual(B.load_task("c3")["state"], "done")
        B._split_assistant_text_events(line("続きをお願い"), "c3")
        self.assertEqual(B.load_task("c3")["state"], "working")
        # An older turn (a log read from the start) changes nothing.
        B.save_task("c3", {"state": "done", "text": "", "ts": 2e9, "seen": True})
        B._split_assistant_text_events(line([{"type": "text", "text": "昔の"}]), "c3")
        self.assertEqual(B.load_task("c3")["state"], "done")

    def test_queued_message_moves_after_the_reply(self):
        # Sent while Claude was still answering: written again after that answer.
        self.sess("c4")
        B._pending_user.pop("c4", None)
        B._last_agent_seq.pop("c4", None)
        def line(kind, content, t="2026-11-11T06:05:38.000Z"):
            return json.dumps({"type": kind, "timestamp": t, "message": {"role": kind, "content": content}}).encode() + b"\n"
        sent = {"seq": 10, "ts": 1.0, "type": "user_message", "text": "#9 から:\n  GPU を起こして", "from": "🔗 x"}
        B._note_pending_user("c4", sent)
        buf = (line("assistant", [{"type": "text", "text": "つながりました"}])
               + line("user", '<pasted_content id="1">\n#9 から:\nGPU を起こして\n</pasted_content>'))
        _, events = B._split_assistant_text_events(buf, "c4")
        self.assertEqual([e["type"] for e in events], ["agent_output", "user_message"])
        self.assertEqual(events[1]["moved_from"], 10)
        self.assertEqual(events[1]["from"], "🔗 x")
        self.assertNotIn("seq", events[1])
        # Taken at once (nothing from Claude in between): left where it is.
        B._note_pending_user("c4", dict(sent, seq=20))
        _, events = B._split_assistant_text_events(line("user", "#9 から: GPU を起こして"), "c4")
        self.assertEqual(events, [])
        self.assertEqual(B._pending_user["c4"], [])

    def test_queued_message_taken_mid_turn(self):
        # Handed into the running turn: only the queue line's "remove" shows it.
        self.sess("c5")
        B._pending_user.pop("c5", None)
        B._last_agent_seq["c5"] = 30
        B._note_pending_user("c5", {"seq": 25, "ts": 1.0, "type": "user_message", "text": "人が判断する段階を入れられますか？"})
        q = json.dumps({"type": "queue-operation", "operation": "remove", "timestamp": "2026-11-11T07:59:59.799Z",
                        "content": "人が判断する段階を入れられますか？"}).encode() + b"\n"
        _, events = B._split_assistant_text_events(q, "c5")
        self.assertEqual([(e["type"], e.get("moved_from")) for e in events], [("user_message", 25)])
        self.assertEqual(B._pending_user["c5"], [])
        # "enqueue" is not taking it.
        B._note_pending_user("c5", {"seq": 40, "ts": 1.0, "type": "user_message", "text": "次"})
        B._split_assistant_text_events(json.dumps({"type": "queue-operation", "operation": "enqueue", "content": "次"}).encode() + b"\n", "c5")
        self.assertEqual(len(B._pending_user["c5"]), 1)

    def test_taken_upto(self):
        # Told to a page whose stream (re)opens: up to just before the oldest still waiting.
        self.sess("c6")
        B._pending_user.pop("c6", None)
        with B._seq_lock:
            B._next_seq["c6"] = 51
        self.assertEqual(B._taken_upto("c6"), 50)
        B._note_pending_user("c6", {"seq": 42, "ts": time.time(), "type": "user_message", "text": "a"})
        B._note_pending_user("c6", {"seq": 45, "ts": time.time(), "type": "user_message", "text": "b"})
        self.assertEqual(B._taken_upto("c6"), 41)
        # Taken in place: pushed with "taken", never "seq" (a seq is dropped as a duplicate).
        got = []
        orig = B.push_ephemeral
        B.push_ephemeral = lambda sid, ev: got.append(ev)
        try:
            B._split_assistant_text_events(json.dumps({"type": "user", "timestamp": "2026-11-12T00:00:00.000Z",
                                                       "message": {"role": "user", "content": "a"}}).encode() + b"\n", "c6")
        finally:
            B.push_ephemeral = orig
        self.assertEqual(got, [{"type": "user_taken", "taken": 42}])
        self.assertEqual(B._taken_upto("c6"), 44)

    def test_talkto_line(self):
        line = json.dumps({"task": {"hook_event_name": "Stop", "last_assistant_message": "x"}}).encode()
        self.assertEqual(B._parse_talkto_lines([line]),
                         [(None, ("task", {"hook_event_name": "Stop", "last_assistant_message": "x"}))])


if __name__ == "__main__":
    unittest.main()
