"""Demo login for the Docker demo (docker/README.md).

A real deployment logs people in with Google OAuth and maps the address to a
Unix account. The demo has neither, so GET /agents/demo-login logs whoever
asks in as the one account named by $AIGW_DEMO_USER. Anyone who can reach
the gateway is that user -- which is why the demo publishes the port on the
host's loopback only, and why this extension is installed by the demo image
and never by a real deployment. Without $AIGW_DEMO_USER it registers nothing.

The login is given only to a request whose Host is this machine's loopback
name (localhost, 127.0.0.1, [::1], any port) or one listed in
$AIGW_DEMO_HOSTS (comma-separated, for opening it under another name). A
page that points its own name at 127.0.0.1 (DNS rebinding) then gets a 403
instead of a session -- not merely a Secure cookie the browser happens to
drop on plain http.
"""
import os
import pwd


def host_name(host):
    """The Host header without its port, lower-cased ("[::1]:8878" -> "[::1]")."""
    host = host.strip().lower()
    if host.startswith("["):
        return host[:host.find("]") + 1] if "]" in host else host
    return host.rsplit(":", 1)[0] if host.count(":") == 1 else host


def register(api):
    user = os.environ.get("AIGW_DEMO_USER")
    if not user:
        return
    pwd.getpwnam(user)              # a missing account fails the load, loudly
    ctx = api.ctx
    allowed = {"localhost", "127.0.0.1", "[::1]"}
    allowed |= {x.strip().lower() for x in os.environ.get("AIGW_DEMO_HOSTS", "").split(",") if x.strip()}

    def demo_login(h, path, qs):
        if path != f"{ctx.base_path}/demo-login":
            return False
        if host_name(h.headers.get("Host", "")) not in allowed:
            h._send_json(403, {"error": "demo login only for localhost (or AIGW_DEMO_HOSTS)"})
            return True
        value, exp = ctx.make_session_cookie(user)
        h._send_redirect(f"{ctx.base_path}/",
                         {"Set-Cookie": ctx.session_set_cookie_header(value, exp)})
        return True

    api.get(f"{ctx.base_path}/demo-login", demo_login)
    api.log(f"demo login enabled for {user}")
