"""The issue Status badge in the session list (the deployment notes): one
GraphQL query for every issue the list holds, run in the background, with
GitHub (gh inside the devbox) stubbed out.

    python3 -m unittest discover -s tests -v
"""
import re
import unittest

from test_shared_search import B


def issue(status=None, state="OPEN"):
    vals = [{"name": "Claude", "field": {"name": "Worker"}}]
    if status:
        vals.append({"name": status, "field": {"name": "Status"}})
    return {"state": state, "projectItems": {"nodes": [{"fieldValues": {"nodes": vals}}]}}


class IssueStatusTest(unittest.TestCase):
    def setUp(self):
        self.issues = {}  # ref -> issue(...) ; a missing one makes the query fail
        self.queries = []

        def graphql(query, **v):
            self.queries.append((query, v))
            out = {}
            for alias in re.findall(r"\b(i\d+):repository", query):
                j = alias[1:]
                ref = f"{v['o' + j]}/{v['r' + j]}#{v['n' + j]}"
                if ref not in self.issues:
                    raise RuntimeError("Could not resolve to a Repository")
                out[alias] = {"issue": self.issues[ref]}
            return out

        self.saved = {k: getattr(B, k) for k in ("gh_graphql", "_issue_status_cache", "_issue_status_busy", "log")}
        B.gh_graphql = graphql
        B._issue_status_cache = {}
        B._issue_status_busy = False
        B.log = lambda *a, **k: None

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(B, k, v)

    def test_one_query_for_all_and_first_status_found(self):
        self.issues = {"o/a#1": issue("Blocked"), "o/a#2": issue(None, "CLOSED"), "o/b#3": issue("In review")}
        got = B._fetch_issue_statuses(["o/a#1", "o/a#2", "o/b#3"])
        self.assertEqual(len(self.queries), 1)
        self.assertEqual(got, {"o/a#1": {"status": "Blocked", "state": "OPEN"},
                               "o/a#2": {"status": None, "state": "CLOSED"},
                               "o/b#3": {"status": "In review", "state": "OPEN"}})

    def test_an_unknown_issue_does_not_hide_the_others(self):
        self.issues = {"o/a#1": issue("Ready")}
        got = B._fetch_issue_statuses(["o/a#1", "o/gone#9"])
        self.assertEqual(got, {"o/a#1": {"status": "Ready", "state": "OPEN"}})

    def test_values_go_through_variables_not_the_query_text(self):
        self.issues = {"o/a#1": issue("Ready")}
        B._fetch_issue_statuses(["o/a#1"])
        query, v = self.queries[0]
        self.assertNotIn("\"o\"", query)
        self.assertEqual(v, {"o0": "o", "r0": "a", "n0": 1})

    def test_list_gets_cached_badge_and_refresh_runs_behind(self):
        self.issues = {"o/a#1": issue("Blocked")}
        started = []
        real_thread = B.threading.Thread

        class Now:  # run the refresh inline, once the list has been answered
            def __init__(self, target, args, daemon):
                self.target, self.args = target, args

            def start(self):
                started.append(self)

        B.threading.Thread = Now
        try:
            sessions = [{"id": "s1", "issue": "o/a#1"}, {"id": "s2", "issue": "o/a#1", "archived": True},
                        {"id": "s3"}, {"id": "s4", "issue": "not a ref"}]
            B.add_issue_statuses(sessions)
            self.assertNotIn("issue_status", sessions[0])  # nothing known yet
            self.assertEqual(len(started), 1)
            self.assertEqual(started[0].args, (["o/a#1"],))
            B.add_issue_statuses([dict(s) for s in sessions])
            self.assertEqual(len(started), 1)  # one refresh at a time
            started[0].target(*started[0].args)

            sessions = [dict(s) for s in sessions]
            B.add_issue_statuses(sessions)
            self.assertEqual(sessions[0]["issue_status"], {"status": "Blocked", "state": "OPEN"})
            self.assertNotIn("issue_status", sessions[1])  # archived
            self.assertEqual(len(started), 1)  # still fresh
            B._issue_status_cache["o/a#1"]["at"] -= B.ISSUE_STATUS_TTL + 1
            B.add_issue_statuses([dict(s) for s in sessions])
            self.assertEqual(len(started), 2)  # stale: asked again
        finally:
            B.threading.Thread = real_thread

    def test_a_failed_refresh_keeps_the_last_known_and_frees_the_slot(self):
        B._issue_status_cache = {"o/a#1": {"status": "Ready", "state": "OPEN", "at": 0}}
        B._issue_status_busy = True
        self.issues = {}
        B._refresh_issue_statuses(["o/a#1"])
        self.assertFalse(B._issue_status_busy)
        self.assertEqual(B._issue_status_cache["o/a#1"]["status"], "Ready")
        self.assertGreater(B._issue_status_cache["o/a#1"]["at"], 0)


if __name__ == "__main__":
    unittest.main()
