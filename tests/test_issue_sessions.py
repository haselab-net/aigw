"""Issue-linked sessions and the auto-start dispatcher (the deployment notes):
the issue reference is checked, the prompt names the issue, and the
dispatcher starts only Ready / Worker=Claude issues nobody else holds --
with GitHub (gh inside the devbox) stubbed out.

    python3 -m unittest discover -s tests -v
"""
import json
import tempfile
import unittest
from pathlib import Path

from test_shared_search import B

ME = "bot-account"


def item(n, status="Ready", worker="Claude", assignees=(), gpu=None, state="OPEN",
         repo="demo-app"):
    vals = [{"name": status, "field": {"name": "Status"}},
            {"name": worker, "field": {"name": "Worker"}}]
    if gpu:
        vals.append({"name": gpu, "field": {"name": "GPU"}})
    return {"id": f"ITEM{n}", "content": {
        "id": f"I{n}", "number": n, "title": f"task {n}", "state": state,
        "repository": {"name": repo, "owner": {"login": "haselab-net"}},
        "assignees": {"nodes": [{"login": a} for a in assignees]}},
        "fieldValues": {"nodes": vals}}


class FakeGitHub:
    def __init__(self, items, readme="", late_assignee=None, others=None):
        self.items, self.readme, self.late_assignee = items, readme, late_assignee
        self.others = others or {}  # project number -> (items, readme), for a second project
        self.calls, self.status = [], {}

    def gh(self, args, timeout=60):
        self.calls.append(args)
        if args[:2] == ["api", "user"]:
            return ME + "\n"
        return ""

    def graphql(self, query, **v):
        if "projectV2(number" in query:
            items, readme = self.others.get(v["n"], (self.items, self.readme))
            return {"organization": {"projectV2": {
                "id": "P%d" % v["n"], "readme": readme,
                "fields": {"nodes": [{"id": "FS", "name": "Status", "options": [
                    {"id": "o-" + x, "name": x} for x in ("Ready", "In progress", "Blocked")]}]},
                "items": {"nodes": items}}}}
        if "updateProjectV2ItemFieldValue" in query:
            self.status[v["i"]] = v["o"][2:]
            return {}
        if "assignees" in query:  # the re-read after claiming
            people = [ME] + ([self.late_assignee] if self.late_assignee else [])
            return {"repository": {"issue": {"assignees": {"nodes": [{"login": p} for p in people]}}}}
        raise AssertionError(query)


class IssueSessionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.sessions = []
        self.created = []
        self.shared = []
        self.sent = []
        self.cfg = {"owner": "haselab-net", "project": 2, "repos": ["haselab-net/demo-app"],
                    "aigw_url": "https://aigw.example", "max_concurrent": 1, "daily_limit": 3,
                    "exclusive_gpus": ["gpu-a"]}

        def create_session(preset, label, **kw):
            meta = {"id": f"s{len(self.created)}", "label": label, "preset": preset,
                    "issue": kw.get("issue"), "auto": kw.get("auto"), "alive": True}
            self.created.append(meta)
            return meta

        stubs = {
            "DISPATCHER_LOG": self.root / "dispatcher-log.json",
            "list_sessions": lambda on_behalf_of=None: self.sessions,
            "create_session": create_session,
            "save_meta": lambda sid, meta: None,
            "share_session": lambda sid, who, mode="write": self.shared.append((sid, who, mode)),
            "send_push_payload": lambda payload: None,
            "send_message": lambda sid, text, **kw: self.sent.append((sid, text)),
        }
        self.saved = {name: getattr(B, name) for name in list(stubs) + ["gh_container", "gh_graphql"]}
        for name, value in stubs.items():
            setattr(B, name, value)

    def tearDown(self):
        for name, value in self.saved.items():
            setattr(B, name, value)
        self.tmp.cleanup()

    def github(self, *items, **kw):
        fake = FakeGitHub(list(items), **kw)
        B.gh_container, B.gh_graphql = fake.gh, fake.graphql
        return fake

    def test_issue_ref(self):
        self.assertEqual(B.parse_issue_ref("haselab-net/demo-app#12"), ("haselab-net", "demo-app", 12))
        for bad in ("demo-app#12", "a/b#0", "a/b#12x", "a/..#1", "a/b c#1", "", None):
            with self.assertRaises(ValueError, msg=bad):
                B.parse_issue_ref(bad)

    def test_prompt_names_the_issue_and_says_when_nobody_watches(self):
        p = B.issue_prompt("haselab-net/demo-app#12", auto=False)
        self.assertIn("gh issue view 12 -R haselab-net/demo-app", p)
        self.assertNotIn("AIGW_AUTO", p)
        self.assertIn("AIGW_AUTO=1", B.issue_prompt("haselab-net/demo-app#12", auto=True))

    def test_create_session_checks_before_touching_anything(self):
        create = self.saved["create_session"]  # the real one; setUp stubs it for the dispatcher
        with self.assertRaises(ValueError):
            create("shell", None, issue="haselab-net/demo-app#1")
        with self.assertRaises(ValueError):
            create("claude-tui", None, auto=True)
        with self.assertRaises(ValueError):
            create("claude-tui", None, issue="nope")

    def test_issue_session_runs_in_its_worktree_with_env_and_prompt(self):
        import subprocess
        sandhome = self.root / "sandhome"
        (sandhome / "demo-app-wt" / "i12").mkdir(parents=True)
        calls = []
        stubs = {
            "SANDHOME": sandhome,
            "session_roots": lambda: [self.root / "sessions"],
            "save_meta": self.saved.get("save_meta", B.save_meta),
            "prepare_issue_worktree": lambda o, r, n: "demo-app-wt/i%d" % n,
            "tmux_exec": lambda loc, args, **kw: calls.append(args) or subprocess.CompletedProcess(args, 0, "", ""),
            "tag_tmux_owner": lambda loc, sid: None,
            "ensure_watcher": lambda sid: None,
            "_accept_workspace_trust_if_shown": lambda loc, sid: None,
            "mark_claude_onboarded": lambda home: None,
            "_unlockd_call": lambda verb, **f: {"ok": True, "unlocked": True, "tier": "root"},
        }
        saved = {k: getattr(B, k) for k in stubs if k != "save_meta"}
        (self.root / "sessions").mkdir()
        for k, v in stubs.items():
            setattr(B, k, v)
        try:
            meta = self.saved["create_session"]("claude-tui", "#12 x", issue="haselab-net/demo-app#12", auto=True)
        finally:
            for k, v in saved.items():
                setattr(B, k, v)
        self.assertEqual(meta["issue"], "haselab-net/demo-app#12")
        self.assertTrue(meta["auto"])
        self.assertEqual(meta["cwd"], str(sandhome / "demo-app-wt" / "i12"))
        respawn = next(a for a in calls if a[0] == "respawn-pane")
        cmd = respawn[respawn.index("--") + 1:]
        self.assertIn("AIGW_ISSUE=haselab-net/demo-app#12", cmd)
        self.assertIn("AIGW_AUTO=1", cmd)
        self.assertIn("gh issue view 12 -R haselab-net/demo-app", cmd[-1])

    def test_starts_a_ready_claude_issue_and_announces_it(self):
        gh = self.github(item(1, status="Triage"), item(2, worker="Human"),
                         item(3, assignees=["someone"]), item(4))
        reason = B.dispatch_once(self.cfg)
        self.assertEqual(reason, "haselab-net/demo-app#4: started s0")
        self.assertEqual(self.created[0]["issue"], "haselab-net/demo-app#4")
        self.assertTrue(self.created[0]["auto"])
        self.assertEqual(gh.status, {"ITEM4": "In progress"})
        self.assertEqual(self.shared, [("s0", B.SHARE_EVERYONE, "read")])
        comment = next(c for c in gh.calls if c[:2] == ["issue", "comment"])
        self.assertIn("https://aigw.example/agents/#s0", comment[-1])

    def test_a_person_assigned_meanwhile_wins(self):
        gh = self.github(item(4), late_assignee="someone")
        self.assertEqual(B.dispatch_once(self.cfg), "haselab-net/demo-app#4: a person took it first")
        self.assertEqual(self.created, [])
        self.assertEqual(gh.status, {"ITEM4": "Ready"})
        self.assertIn(["issue", "edit", "4", "-R", "haselab-net/demo-app", "--remove-assignee", "@me"],
                      gh.calls)

    def test_bot_already_assigned_is_not_a_person(self):
        self.github(item(4, assignees=[ME]))
        self.assertTrue(B.dispatch_once(self.cfg).endswith("started s0"))

    def test_readme_switch_and_config_switch(self):
        self.github(item(4), readme="運用メモ\n自動着手: OFF\n")
        self.assertEqual(B.dispatch_once(self.cfg), "switched off in the project README")
        self.assertEqual(B.dispatch_once(dict(self.cfg, enabled=False)), "disabled in dispatcher.json")
        self.assertEqual(self.created, [])

    def test_limits(self):
        self.github(item(4), item(5))
        self.sessions = [{"id": "x", "auto": True, "alive": True, "issue": "haselab-net/demo-app#9"}]
        self.assertEqual(B.dispatch_once(self.cfg), "at max_concurrent")
        self.sessions = []
        B.DISPATCHER_LOG.write_text(json.dumps([{"event": "started", "ts": __import__("time").time()}] * 3))
        self.assertEqual(B.dispatch_once(self.cfg), "daily limit reached")

    def test_skips_issue_with_a_session_and_busy_exclusive_gpu(self):
        self.github(item(4), item(5, gpu="gpu-a"), item(6, gpu="gpu-b"))
        self.sessions = [{"id": "a", "issue": "haselab-net/demo-app#4", "alive": True},
                         {"id": "b", "auto": True, "alive": True, "issue_gpu": "gpu-a",
                          "issue": "haselab-net/demo-app#9"}]
        self.assertEqual(B.dispatch_once(dict(self.cfg, max_concurrent=2)),
                         "haselab-net/demo-app#6: started s0")

    def test_ready_again_resumes_the_bots_open_session(self):
        gh = self.github(item(12), item(4))
        self.sessions = [{"id": "x", "auto": True, "alive": True, "issue": "haselab-net/demo-app#12"}]
        self.assertEqual(B.dispatch_once(self.cfg), "haselab-net/demo-app#12: resumed x")
        self.assertEqual(self.created, [])
        self.assertEqual(gh.status, {"ITEM12": "In progress"})
        self.assertEqual(self.sent[0][0], "x")
        self.assertIn("gh issue view 12 -R haselab-net/demo-app --comments", self.sent[0][1])

    def test_blocked_session_holds_no_slot(self):
        self.github(item(12, status="Blocked"), item(4))
        self.sessions = [{"id": "x", "auto": True, "alive": True, "issue": "haselab-net/demo-app#12"}]
        self.assertEqual(B.dispatch_once(self.cfg), "haselab-net/demo-app#4: started s0")
        self.assertEqual(self.sent, [])

    def test_in_review_or_closed_session_holds_no_slot(self):
        self.github(item(17, status="In review"), item(11, status="Done", state="CLOSED"), item(4))
        self.sessions = [{"id": "x", "auto": True, "alive": True, "issue": "haselab-net/demo-app#17"},
                         {"id": "y", "auto": True, "alive": True, "issue": "haselab-net/demo-app#11"}]
        self.assertEqual(B.dispatch_once(self.cfg), "haselab-net/demo-app#4: started s0")

    def test_resume_waits_for_a_free_slot(self):
        self.github(item(12), item(4, status="In progress"))
        self.sessions = [{"id": "x", "auto": True, "alive": True, "issue": "haselab-net/demo-app#12"},
                         {"id": "y", "auto": True, "alive": True, "issue": "haselab-net/demo-app#4"}]
        self.assertEqual(B.dispatch_once(self.cfg), "at max_concurrent")
        self.assertEqual(self.sent, [])

    def test_several_projects(self):
        cfg = dict(self.cfg, projects=[
            {"project": 2, "repos": ["haselab-net/demo-app"]},
            {"project": 4, "repos": ["haselab-net/aigw-priv"]}])
        gh = self.github(item(4), readme="自動着手: OFF",
                         others={4: ([item(7, repo="aigw-priv")], "")})
        self.assertEqual(B.dispatch_once(cfg), "haselab-net/aigw-priv#7: started s0")
        self.assertEqual(gh.status, {"ITEM7": "In progress"})
        # Each project's own repos only: project 4 does not start demo-app issues.
        gh.others = {4: ([item(8)], "")}
        gh.readme = ""
        self.sessions = [{"id": "s0", "auto": True, "alive": True, "issue": "haselab-net/aigw-priv#7"}]
        self.assertEqual(B.dispatch_once(dict(cfg, max_concurrent=2)), "haselab-net/demo-app#4: started s1")
        gh.readme = "自動着手: OFF"
        gh.others = {4: ([], "自動着手: OFF")}
        self.assertEqual(B.dispatch_once(cfg), "switched off in the project README")

    def test_max_concurrent_is_per_project(self):
        cfg = dict(self.cfg, max_concurrent=1, projects=[
            {"project": 2, "repos": ["haselab-net/demo-app"]},
            {"project": 4, "repos": ["haselab-net/aigw-priv"], "max_concurrent": 2}])
        self.github(item(4), others={4: ([item(7, repo="aigw-priv")], "")})
        # demo-app is full, aigw-priv still has room.
        self.sessions = [{"id": "x", "auto": True, "alive": True, "issue": "haselab-net/demo-app#9"}]
        self.assertEqual(B.dispatch_once(cfg), "haselab-net/aigw-priv#7: started s0")
        # Both of aigw-priv's slots used: nothing starts there either.
        self.sessions += [{"id": "y", "auto": True, "alive": True, "issue": "haselab-net/aigw-priv#8"},
                          {"id": "z", "auto": True, "alive": True, "issue": "haselab-net/aigw-priv#9"}]
        self.assertEqual(B.dispatch_once(cfg), "at max_concurrent")

    def test_other_repos_are_ignored(self):
        self.github(item(4, repo="other"))
        self.assertEqual(B.dispatch_once(self.cfg), "nothing to do")


if __name__ == "__main__":
    unittest.main()


class OriginCheckTest(unittest.TestCase):
    """prepare_issue_worktree finds the clone by repo name alone, so it
    checks the clone's origin is that owner's repo (the deployment notes)."""

    def test_origin_is_repo(self):
        for url in ("https://github.com/haselab-net/demo-app.git", "https://github.com/haselab-net/demo-app",
                    "git@github.com:haselab-net/demo-app.git", "ssh://git@github.com/Haselab-Net/Demo-App.git\n"):
            self.assertTrue(B.origin_is_repo(url, "haselab-net", "demo-app"), url)
        for url in ("https://github.com/evil/demo-app.git", "https://github.com/haselab-net/demo-app2.git",
                    "https://example.com/haselab-net/demo-app.git", "/home/u/demo-app"):
            self.assertFalse(B.origin_is_repo(url, "haselab-net", "demo-app"), url)
