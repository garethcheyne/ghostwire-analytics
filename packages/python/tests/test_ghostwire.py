import asyncio
import json
import logging
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import ghostwire  # noqa: E402
from ghostwire.asgi import GhostwireMiddleware  # noqa: E402
from ghostwire.client import Client, ClientOptions, build_frames  # noqa: E402
from ghostwire.log_handler import GhostwireHandler  # noqa: E402
from ghostwire.wsgi import GhostwireWSGIMiddleware  # noqa: E402

WEBSITE = "7d3ecc49-7e12-4672-b092-685c96d2a6d4"


class Server:
    """A local HTTP server that records what the client posts."""

    def __init__(self, status=202):
        received = self.received = []

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers.get("content-length", 0))
                received.append(
                    {
                        "path": self.path,
                        "auth": self.headers.get("authorization"),
                        "body": json.loads(self.rfile.read(length) or b"{}"),
                    }
                )
                self.send_response(status)
                self.end_headers()
                self.wfile.write(b'{"ok":true}')

            def log_message(self, *args):
                pass

        self.httpd = HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


def make_client(server, **options):
    return Client(
        ClientOptions(host=server.url, website_id=WEBSITE, key="gwe_test", **options)
    )


def raise_error():
    return {}["missing"]


class ClientTests(unittest.TestCase):
    def setUp(self):
        self.server = Server()

    def tearDown(self):
        self.server.close()

    def test_sends_the_exception_with_frames_innermost_first(self):
        client = make_client(self.server, environment="production", release="2.4.1")
        try:
            raise_error()
        except KeyError as error:
            self.assertTrue(client.capture_exception(error, user={"id": "jane", "email": "j@x.io"}))
        self.assertTrue(client.flush(3))

        [sent] = self.server.received
        self.assertEqual(sent["path"], "/api/errors")
        self.assertEqual(sent["auth"], "Bearer gwe_test")
        body = sent["body"]
        self.assertEqual(body["website"], WEBSITE)
        self.assertEqual(body["platform"], "python")
        self.assertEqual(body["error"]["type"], "KeyError")
        self.assertEqual(body["error"]["message"], "'missing'")
        self.assertEqual(body["error"]["frames"][0]["function"], "raise_error")
        self.assertTrue(body["error"]["frames"][0]["inApp"])
        self.assertIn("Traceback", body["error"]["stack"])
        self.assertEqual(body["release"], "2.4.1")
        self.assertEqual(body["user"], {"id": "jane", "email": "j@x.io"})
        self.assertTrue(body["handled"])

    def test_uses_the_exception_being_handled(self):
        client = make_client(self.server)
        try:
            raise ValueError("bad input")
        except ValueError:
            self.assertTrue(client.capture_exception())
        client.flush(3)
        self.assertEqual(self.server.received[0]["body"]["error"]["message"], "bad input")

    def test_before_send_can_change_or_drop_reports(self):
        client = make_client(
            self.server,
            before_send=lambda report: None
            if "secret" in report["error"]["message"]
            else {**report, "tags": {"scrubbed": "yes"}},
        )
        client.capture_exception(ValueError("secret token"))
        client.capture_exception(ValueError("fine"))
        client.flush(3)

        self.assertEqual(len(self.server.received), 1)
        self.assertEqual(self.server.received[0]["body"]["tags"], {"scrubbed": "yes"})

    def test_does_nothing_without_configuration_and_never_raises(self):
        client = Client(ClientOptions())
        self.assertFalse(client.enabled)
        self.assertFalse(client.capture_exception(ValueError("x")))

        broken = make_client(self.server, before_send=lambda report: 1 / 0)
        self.assertFalse(broken.capture_exception(ValueError("x")))

    def test_a_failing_server_does_not_raise(self):
        client = Client(
            ClientOptions(host="http://127.0.0.1:9", website_id=WEBSITE, key="gwe_x", timeout=0.5)
        )
        self.assertTrue(client.capture_exception(ValueError("x")))
        self.assertTrue(client.flush(3))

    def test_registers_a_release(self):
        client = make_client(self.server, release="2.4.1", environment="production")
        self.assertTrue(client.register_release(commit="abc123"))
        sent = self.server.received[0]
        self.assertEqual(sent["path"], f"/api/websites/{WEBSITE}/releases")
        self.assertEqual(
            sent["body"], {"version": "2.4.1", "environment": "production", "commit": "abc123"}
        )

    def test_library_frames_are_not_in_app(self):
        try:
            json.loads("{bad")
        except ValueError as error:
            frames = build_frames(error.__traceback__)
        self.assertFalse(frames[0]["inApp"])
        self.assertTrue(frames[-1]["inApp"])


class IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.server = Server()
        ghostwire.init(host=self.server.url, website_id=WEBSITE, key="gwe_test", excepthook=False)

    def tearDown(self):
        self.server.close()

    def test_asgi_middleware_reports_and_re_raises(self):
        async def app(scope, receive, send):
            raise RuntimeError("boom")

        middleware = GhostwireMiddleware(app, get_user=lambda scope: {"id": "jane"})
        scope = {
            "type": "http",
            "method": "POST",
            "scheme": "https",
            "path": "/orders",
            "query_string": b"token=secret",
            "headers": [(b"host", b"shop.example.com"), (b"user-agent", b"pytest")],
        }

        with self.assertRaises(RuntimeError):
            asyncio.run(middleware(scope, None, None))
        ghostwire.flush(3)

        body = self.server.received[0]["body"]
        self.assertFalse(body["handled"])
        self.assertEqual(
            body["request"],
            {"method": "POST", "url": "https://shop.example.com/orders", "userAgent": "pytest"},
        )
        self.assertEqual(body["user"], {"id": "jane"})

    def test_wsgi_middleware_reports_and_re_raises(self):
        def app(environ, start_response):
            raise RuntimeError("boom")

        middleware = GhostwireWSGIMiddleware(app)
        environ = {"REQUEST_METHOD": "GET", "PATH_INFO": "/", "HTTP_HOST": "shop.example.com"}

        with self.assertRaises(RuntimeError):
            middleware(environ, lambda *args: None)
        ghostwire.flush(3)
        self.assertEqual(self.server.received[0]["body"]["request"]["url"], "http://shop.example.com/")

    def test_logging_handler_reports_errors(self):
        logger = logging.getLogger("tests.checkout")
        logger.addHandler(GhostwireHandler())
        logger.propagate = False
        try:
            try:
                raise_error()
            except KeyError:
                logger.exception("Payment failed")
            logger.warning("Only a warning")  # below ERROR: not reported
            logger.error("Queue is backing up")
        finally:
            logger.handlers.clear()
        ghostwire.flush(3)

        bodies = [sent["body"] for sent in self.server.received]
        self.assertEqual(len(bodies), 2)
        self.assertEqual(bodies[0]["error"]["type"], "KeyError")
        self.assertEqual(bodies[1]["error"], {"type": "Log.error", "message": "Queue is backing up"})

    def test_excepthook_reports_then_calls_the_previous_hook(self):
        seen = []
        original = sys.excepthook
        sys.excepthook = lambda *args: seen.append(args[0])
        try:
            ghostwire._installed = False
            ghostwire.install_excepthook()
            try:
                raise_error()
            except KeyError:
                sys.excepthook(*sys.exc_info())
        finally:
            sys.excepthook = original
            ghostwire._installed = False

        self.assertEqual(seen, [KeyError])
        self.assertFalse(self.server.received[0]["body"]["handled"])


if __name__ == "__main__":
    unittest.main()
